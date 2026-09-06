import { test } from "node:test";
import assert from "node:assert/strict";
import { matchOutletRule, outletRuleSpecificity, pickBestOutletRule, pickBestCoaRule, matchCoaRule, coaRuleSpecificity } from "../rule-match";
import type { CoaRuleInput, MappableBankRow, OutletRuleInput } from "../types";

function row(overrides: Partial<MappableBankRow> = {}): MappableBankRow {
  return {
    bankId: "bank-1",
    unitRaw: null,
    classificationRaw: "Administrasi Bank",
    descriptionRaw: "Adm Bank",
    debitSen: 0n,
    creditSen: 350000n, // Rp 3,500.00 in sen
    detectedOutletId: null,
    ...overrides,
  };
}

function outletRule(overrides: Partial<OutletRuleInput> = {}): OutletRuleInput {
  return {
    id: "rule-1",
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

test("an inactive rule never matches", () => {
  const rule = outletRule({ active: false, classification: "Administrasi Bank" });
  assert.equal(matchOutletRule(rule, row()), false);
});

test("bank_id null matches any bank (wildcard); a specific bank_id must match exactly", () => {
  assert.equal(matchOutletRule(outletRule({ bank_id: null }), row({ bankId: "bank-1" })), true);
  assert.equal(matchOutletRule(outletRule({ bank_id: "bank-2" }), row({ bankId: "bank-1" })), false);
  assert.equal(matchOutletRule(outletRule({ bank_id: "bank-1" }), row({ bankId: "bank-1" })), true);
});

test("classification match is case-insensitive and exact, not substring", () => {
  assert.equal(matchOutletRule(outletRule({ classification: "administrasi bank" }), row({ classificationRaw: "Administrasi Bank" })), true);
  assert.equal(matchOutletRule(outletRule({ classification: "Administrasi" }), row({ classificationRaw: "Administrasi Bank" })), false);
});

test("direction 'out' matches credit>0 rows, 'in' matches debit>0 rows", () => {
  assert.equal(matchOutletRule(outletRule({ direction: "out" }), row({ creditSen: 100n, debitSen: 0n })), true);
  assert.equal(matchOutletRule(outletRule({ direction: "out" }), row({ creditSen: 0n, debitSen: 100n })), false);
  assert.equal(matchOutletRule(outletRule({ direction: "in" }), row({ creditSen: 0n, debitSen: 100n })), true);
});

test("match_type keyword is a case-insensitive substring against the description", () => {
  const rule = outletRule({ match_type: "keyword", match_value: "listrik" });
  assert.equal(matchOutletRule(rule, row({ descriptionRaw: "Bayar LISTRIK bulan ini" })), true);
  assert.equal(matchOutletRule(rule, row({ descriptionRaw: "Bayar air" })), false);
});

test("match_type regex applies the pattern case-insensitively and never throws on an invalid pattern", () => {
  const validRegex = outletRule({ match_type: "regex", match_value: "^bayar (listrik|air)$" });
  assert.equal(matchOutletRule(validRegex, row({ descriptionRaw: "Bayar Listrik" })), true);
  assert.equal(matchOutletRule(validRegex, row({ descriptionRaw: "Bayar internet" })), false);

  const invalidRegex = outletRule({ match_type: "regex", match_value: "(unterminated[" });
  assert.doesNotThrow(() => matchOutletRule(invalidRegex, row()));
  assert.equal(matchOutletRule(invalidRegex, row()), false);
});

test("specificity counts non-null discriminating fields, a wildcard rule scores 0", () => {
  assert.equal(outletRuleSpecificity(outletRule()), 0);
  assert.equal(outletRuleSpecificity(outletRule({ bank_id: "b1", classification: "X" })), 2);
  assert.equal(outletRuleSpecificity(outletRule({ bank_id: "b1", unit_value: "U", classification: "X", direction: "out", match_value: "v" })), 5);
});

test("pickBestOutletRule prefers lower priority number regardless of specificity", () => {
  const specific = outletRule({ id: "specific", priority: 50, bank_id: "bank-1", classification: "Administrasi Bank" });
  const higherPriorityButBroad = outletRule({ id: "broad-but-priority-1", priority: 1, output_outlet_id: "outlet-2" });
  const pick = pickBestOutletRule([specific, higherPriorityButBroad], row());
  assert.equal(pick.winner?.id, "broad-but-priority-1");
  assert.equal(pick.ambiguous, false);
});

test("pickBestOutletRule breaks a priority tie by specificity (more specific wins)", () => {
  const generic = outletRule({ id: "generic", priority: 100 });
  const specific = outletRule({ id: "specific", priority: 100, bank_id: "bank-1", classification: "Administrasi Bank" });
  const pick = pickBestOutletRule([generic, specific], row());
  assert.equal(pick.winner?.id, "specific");
});

test("two equally-specific rules at the same priority are reported ambiguous, never silently picked", () => {
  const a = outletRule({ id: "a", priority: 100, bank_id: "bank-1", output_outlet_id: "outlet-a" });
  const b = outletRule({ id: "b", priority: 100, classification: "Administrasi Bank", output_outlet_id: "outlet-b" });
  const pick = pickBestOutletRule([a, b], row());
  assert.equal(pick.winner, null);
  assert.equal(pick.ambiguous, true);
  assert.deepEqual(new Set(pick.candidates.map((r) => r.id)), new Set(["a", "b"]));
});

test("no matching rule at all is neither a winner nor ambiguous", () => {
  const pick = pickBestOutletRule([outletRule({ bank_id: "some-other-bank" })], row({ bankId: "bank-1" }));
  assert.equal(pick.winner, null);
  assert.equal(pick.ambiguous, false);
  assert.deepEqual(pick.candidates, []);
});

test("COA rule outlet_id filters against the row's already-detected outlet", () => {
  const rule = coaRule({ outlet_id: "outlet-1" });
  assert.equal(matchCoaRule(rule, row({ detectedOutletId: "outlet-1" })), true);
  assert.equal(matchCoaRule(rule, row({ detectedOutletId: "outlet-2" })), false);
  assert.equal(matchCoaRule(rule, row({ detectedOutletId: null })), false);
});

test("COA rule amount_min/amount_max range-filters against the credit amount", () => {
  const rule = coaRule({ amount_min: "1000", amount_max: "5000" });
  assert.equal(matchCoaRule(rule, row({ creditSen: 350000n })), true); // Rp 3,500
  assert.equal(matchCoaRule(rule, row({ creditSen: 50000n })), false); // Rp 500, below min
  assert.equal(matchCoaRule(rule, row({ creditSen: 100000000n })), false); // Rp 1,000,000, above max
});

test("COA rule description_keyword is a case-insensitive substring match", () => {
  const rule = coaRule({ description_keyword: "gaji" });
  assert.equal(matchCoaRule(rule, row({ descriptionRaw: "Pembayaran Gaji Agustus" })), true);
  assert.equal(matchCoaRule(rule, row({ descriptionRaw: "Bayar listrik" })), false);
});

test("coaRuleSpecificity counts every non-null discriminator, including amount range and outlet", () => {
  assert.equal(coaRuleSpecificity(coaRule()), 0);
  assert.equal(coaRuleSpecificity(coaRule({ bank_id: "b1", outlet_id: "o1", amount_min: "1", amount_max: "2" })), 4);
});

test("pickBestCoaRule mirrors the outlet resolution's priority+specificity+ambiguity rules", () => {
  const a = coaRule({ id: "a", priority: 100, classification: "Administrasi Bank" });
  const b = coaRule({ id: "b", priority: 100, description_keyword: "adm" });
  const pick = pickBestCoaRule([a, b], row());
  assert.equal(pick.winner, null);
  assert.equal(pick.ambiguous, true);
});
