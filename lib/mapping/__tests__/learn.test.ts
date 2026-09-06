import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLearnedCoaRule, buildLearnedOutletRule } from "../learn";

test("a learned outlet rule is scoped to exactly this row's bank/unit/classification and gets a low (high-priority) number", () => {
  const rule = buildLearnedOutletRule({
    row: { bankId: "bank-1", unitRaw: "  Store Brand  ", classificationRaw: "Administrasi Bank" },
    outputOutletId: "outlet-1",
    createdBy: "user-1",
  });
  assert.equal(rule.bank_id, "bank-1");
  assert.equal(rule.unit_value, "Store Brand");
  assert.equal(rule.classification, "Administrasi Bank");
  assert.equal(rule.output_outlet_id, "outlet-1");
  assert.equal(rule.active, true);
  assert.ok(rule.priority < 100, "learned rule must outrank the default priority-100 rules");
});

test("a blank unit on the source row becomes null, not an empty-string rule field that would only match blank units forever", () => {
  const rule = buildLearnedOutletRule({
    row: { bankId: "bank-1", unitRaw: "   ", classificationRaw: "Gaji" },
    outputOutletId: "outlet-1",
    createdBy: "user-1",
  });
  assert.equal(rule.unit_value, null);
});

test("a learned COA rule for a row with no detected outlet is marked no_outlet_needed", () => {
  const rule = buildLearnedCoaRule({
    row: { bankId: "bank-1", unitRaw: null, classificationRaw: "Prive" },
    detectedOutletId: null,
    resultCoaId: "coa-prive",
    createdBy: "user-1",
  });
  assert.equal(rule.outlet_id, null);
  assert.equal(rule.no_outlet_needed, true);
  assert.equal(rule.result_coa_id, "coa-prive");
});

test("a learned COA rule for a row that did resolve an outlet is scoped to that outlet", () => {
  const rule = buildLearnedCoaRule({
    row: { bankId: "bank-1", unitRaw: null, classificationRaw: "Listrik & Air" },
    detectedOutletId: "outlet-1",
    resultCoaId: "coa-utilities",
    createdBy: "user-1",
  });
  assert.equal(rule.outlet_id, "outlet-1");
  assert.equal(rule.no_outlet_needed, false);
});
