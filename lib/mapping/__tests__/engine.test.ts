import { test } from "node:test";
import assert from "node:assert/strict";
import { mapBankTransaction } from "../engine";
import type { CoaRuleInput, MappableBankRow, OutletRuleInput } from "../types";

function row(overrides: Partial<MappableBankRow> = {}): MappableBankRow {
  return {
    bankId: "bank-mandiri-outlet",
    unitRaw: null,
    classificationRaw: "Administrasi Bank",
    descriptionRaw: "Adm Bank",
    debitSen: 0n,
    creditSen: 350000n,
    detectedOutletId: null,
    ...overrides,
  };
}

function outletRule(overrides: Partial<OutletRuleInput> = {}): OutletRuleInput {
  return {
    id: "outlet-rule-1",
    bank_id: null,
    unit_value: null,
    classification: null,
    match_type: "keyword",
    match_value: null,
    direction: null,
    output_outlet_id: "outlet-1",
    priority: 100,
    active: true,
    ...overrides,
  };
}

function coaRule(overrides: Partial<CoaRuleInput> = {}): CoaRuleInput {
  return {
    id: "coa-rule-1",
    bank_id: null,
    outlet_id: null,
    unit_value: null,
    classification: null,
    description_keyword: null,
    direction: null,
    amount_min: null,
    amount_max: null,
    result_coa_id: "coa-1",
    bank_coa_override_id: null,
    no_outlet_needed: false,
    priority: 100,
    active: true,
    ...overrides,
  };
}

test("a row cleanly resolved by both an outlet rule and a COA rule has no exception", () => {
  const result = mapBankTransaction({
    row: row(),
    outletRules: [outletRule({ classification: "Administrasi Bank", output_outlet_id: "outlet-1" })],
    coaRules: [coaRule({ classification: "Administrasi Bank", result_coa_id: "coa-bank-fee" })],
  });
  assert.equal(result.detectedOutletId, "outlet-1");
  assert.equal(result.detectedCoaId, "coa-bank-fee");
  assert.equal(result.exceptionType, null);
  assert.equal(result.isInterbankTransfer, false);
  assert.equal(result.isSharedCostCandidate, false);
});

test("no outlet rule matches at all → outlet_not_detected, even if a COA rule would resolve", () => {
  const result = mapBankTransaction({
    row: row(),
    outletRules: [],
    coaRules: [coaRule({ classification: "Administrasi Bank" })],
  });
  assert.equal(result.detectedOutletId, null);
  assert.equal(result.exceptionType, "outlet_not_detected");
});

test("a COA rule flagged no_outlet_needed suppresses the outlet_not_detected exception", () => {
  const result = mapBankTransaction({
    row: row({ classificationRaw: "Prive" }),
    outletRules: [],
    coaRules: [coaRule({ classification: "Prive", result_coa_id: "coa-prive", no_outlet_needed: true })],
  });
  assert.equal(result.detectedOutletId, null);
  assert.equal(result.detectedCoaId, "coa-prive");
  assert.equal(result.exceptionType, null);
});

test("outlet resolves but no COA rule matches an entirely unconfigured classification → unknown_classification", () => {
  const result = mapBankTransaction({
    row: row({ classificationRaw: "Klasifikasi Baru Yang Belum Pernah Ada" }),
    // Bank-scoped wildcard — resolves the outlet without any rule
    // referencing this classification, so it stays genuinely unknown to
    // both rule sets (the point of this test).
    outletRules: [outletRule({ bank_id: "bank-mandiri-outlet" })],
    coaRules: [coaRule({ classification: "Administrasi Bank" })], // unrelated, known classification exists elsewhere
  });
  assert.equal(result.detectedOutletId, "outlet-1");
  assert.equal(result.detectedCoaId, null);
  assert.equal(result.exceptionType, "unknown_classification");
});

test("outlet resolves, classification is known but no specific rule fires for this row → coa_not_detected, not unknown_classification", () => {
  const result = mapBankTransaction({
    row: row({ bankId: "bank-x" }),
    outletRules: [outletRule({ classification: "Administrasi Bank" })],
    // The classification IS configured somewhere, just scoped to a different bank.
    coaRules: [coaRule({ classification: "Administrasi Bank", bank_id: "bank-y" })],
  });
  assert.equal(result.exceptionType, "coa_not_detected");
});

test("two equally-specific outlet rules tie → ambiguous_mapping, no outlet silently guessed", () => {
  const result = mapBankTransaction({
    row: row(),
    outletRules: [
      outletRule({ id: "a", bank_id: "bank-mandiri-outlet", output_outlet_id: "outlet-a" }),
      outletRule({ id: "b", classification: "Administrasi Bank", output_outlet_id: "outlet-b" }),
    ],
    coaRules: [],
  });
  assert.equal(result.detectedOutletId, null);
  assert.equal(result.exceptionType, "ambiguous_mapping");
  assert.equal(result.outletAmbiguousRuleIds.length, 2);
});

test("'Mutasi antar unit' is flagged interbank_transfer even when outlet/COA rules would otherwise resolve cleanly", () => {
  const result = mapBankTransaction({
    row: row({ classificationRaw: "Mutasi antar unit", descriptionRaw: "Pindah dana ke rekening outlet lain" }),
    outletRules: [outletRule({ classification: "Mutasi antar unit" })],
    coaRules: [coaRule({ classification: "Mutasi antar unit" })],
  });
  assert.equal(result.isInterbankTransfer, true);
  assert.equal(result.exceptionType, "interbank_transfer");
  // Still resolves outlet/coa for reference — the exception is what
  // gates it from being posted as a normal expense, not blank fields.
  assert.equal(result.detectedOutletId, "outlet-1");
});

test("a shared-cost classification is flagged shared_cost_candidate", () => {
  const result = mapBankTransaction({
    row: row({ classificationRaw: "Biaya Bersama Kantor Pusat", descriptionRaw: "Overhead seluruh outlet" }),
    outletRules: [],
    coaRules: [],
  });
  assert.equal(result.isSharedCostCandidate, true);
  assert.equal(result.exceptionType, "shared_cost_candidate");
});

test("interbank detection takes precedence over shared cost if both keyword sets somehow match", () => {
  const result = mapBankTransaction({
    row: row({ classificationRaw: "Mutasi antar unit", descriptionRaw: "Biaya bersama dipindah antar rekening" }),
    outletRules: [],
    coaRules: [],
  });
  assert.equal(result.isInterbankTransfer, true);
  assert.equal(result.isSharedCostCandidate, false);
  assert.equal(result.exceptionType, "interbank_transfer");
});
