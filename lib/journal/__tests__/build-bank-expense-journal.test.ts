import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBankExpenseJournal } from "../build-bank-expense-journal";

function input(overrides: Partial<Parameters<typeof buildBankExpenseJournal>[0]> = {}) {
  return {
    bankTransactionId: "txn-1",
    importBatchId: "batch-1",
    entityId: "entity-1",
    txnDate: "2026-08-01",
    detectedOutletId: "outlet-1",
    detectedCoaId: "coa-expense",
    bankId: "bank-1",
    bankCoaId: "coa-bank",
    creditSen: 350000n,
    description: "Adm Bank",
    ...overrides,
  };
}

test("Dr the mapped expense COA, Cr the bank's own COA — never a generic cash account", () => {
  const draft = buildBankExpenseJournal(input());
  assert.equal(draft.sourceType, "bank_expense");
  assert.equal(draft.sourceId, "txn-1");
  assert.equal(draft.lines.length, 2);
  assert.equal(draft.lines[0]?.coaId, "coa-expense");
  assert.equal(draft.lines[0]?.debitSen, 350000n);
  assert.equal(draft.lines[1]?.coaId, "coa-bank");
  assert.equal(draft.lines[1]?.creditSen, 350000n);
  assert.equal(draft.lines[1]?.bankAccountId, "bank-1");
});

test("the credit line always carries bank_account_id for reconciliation traceability", () => {
  const draft = buildBankExpenseJournal(input());
  assert.equal(draft.lines[1]?.bankAccountId, "bank-1");
  assert.equal(draft.lines[0]?.bankAccountId, null);
});

test("a no_outlet_needed mapping (Prive/Angsuran) produces a journal with a null outlet on both lines", () => {
  const draft = buildBankExpenseJournal(input({ detectedOutletId: null }));
  assert.equal(draft.lines[0]?.outletId, null);
  assert.equal(draft.lines[1]?.outletId, null);
});

test("the resulting draft is always balanced by construction", () => {
  const draft = buildBankExpenseJournal(input({ creditSen: 171065026n }));
  const totalDebit = draft.lines.reduce((s, l) => s + l.debitSen, 0n);
  const totalCredit = draft.lines.reduce((s, l) => s + l.creditSen, 0n);
  assert.equal(totalDebit, totalCredit);
});

test("a zero or negative amount is rejected rather than producing a degenerate journal", () => {
  assert.throws(() => buildBankExpenseJournal(input({ creditSen: 0n })));
  assert.throws(() => buildBankExpenseJournal(input({ creditSen: -100n })));
});
