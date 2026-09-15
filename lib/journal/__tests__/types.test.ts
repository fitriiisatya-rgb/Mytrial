import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBalance } from "../types";

function line(overrides: Partial<Parameters<typeof checkBalance>[0][number]> = {}) {
  return { coaId: "coa-a", entityId: "entity-1", outletId: null, bankAccountId: null, departmentId: null, costCenterId: null, debitSen: 100n, creditSen: 0n, description: null, ...overrides };
}

test("a balanced two-line journal passes with no errors", () => {
  const result = checkBalance([line({ debitSen: 100n, creditSen: 0n }), line({ debitSen: 0n, creditSen: 100n })]);
  assert.equal(result.balanced, true);
  assert.deepEqual(result.errors, []);
});

test("an unbalanced journal reports both totals in the error", () => {
  const result = checkBalance([line({ debitSen: 100n, creditSen: 0n }), line({ debitSen: 0n, creditSen: 50n })]);
  assert.equal(result.balanced, false);
  assert.equal(result.totalDebitSen, 100n);
  assert.equal(result.totalCreditSen, 50n);
});

test("negative debit or credit is always an error", () => {
  const result = checkBalance([line({ debitSen: -100n, creditSen: 0n }), line({ debitSen: 0n, creditSen: -100n })]);
  assert.equal(result.balanced, false);
});

test("fewer than 2 lines is an error even if trivially 'balanced' (a single 0/0 line)", () => {
  const result = checkBalance([line({ debitSen: 0n, creditSen: 0n })]);
  assert.equal(result.balanced, false);
});

test("a single large balanced pair (e.g. Rp 171,065,026.59 in sen) still checks out exactly", () => {
  const result = checkBalance([line({ debitSen: 17106502659n, creditSen: 0n }), line({ debitSen: 0n, creditSen: 17106502659n })]);
  assert.equal(result.balanced, true);
});
