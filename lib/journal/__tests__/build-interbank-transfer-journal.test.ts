import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInterbankTransferJournal } from "../build-interbank-transfer-journal";

function input(overrides: Partial<Parameters<typeof buildInterbankTransferJournal>[0]> = {}) {
  return {
    bankTransferId: "transfer-1",
    importBatchId: "batch-1",
    entityId: "entity-1",
    transferDate: "2026-08-01",
    sourceBankId: "bank-source",
    sourceBankCoaId: "coa-bank-source",
    destinationBankId: null,
    destinationBankCoaId: null,
    transferClearingCoaId: "coa-clearing-1090",
    amountSen: 10000000n,
    description: "Pindah dana ke rekening outlet lain",
    ...overrides,
  };
}

test("with no confirmed destination, Dr the transfer clearing account, Cr the source bank's own COA", () => {
  const draft = buildInterbankTransferJournal(input());
  assert.equal(draft.sourceType, "interbank_transfer");
  assert.equal(draft.lines[0]?.coaId, "coa-clearing-1090");
  assert.equal(draft.lines[0]?.bankAccountId, null);
  assert.equal(draft.lines[1]?.coaId, "coa-bank-source");
  assert.equal(draft.lines[1]?.bankAccountId, "bank-source");
});

test("with a confirmed destination, Dr the destination bank's own COA instead of the clearing account", () => {
  const draft = buildInterbankTransferJournal(input({ destinationBankId: "bank-dest", destinationBankCoaId: "coa-bank-dest" }));
  assert.equal(draft.lines[0]?.coaId, "coa-bank-dest");
  assert.equal(draft.lines[0]?.bankAccountId, "bank-dest");
});

test("no line ever carries an outlet dimension — a transfer is never an outlet-level expense", () => {
  const draft = buildInterbankTransferJournal(input());
  assert.equal(draft.lines[0]?.outletId, null);
  assert.equal(draft.lines[1]?.outletId, null);
});

test("uses source_type interbank_transfer, never bank_expense — this must never hit P&L accounts", () => {
  const draft = buildInterbankTransferJournal(input());
  assert.equal(draft.sourceType, "interbank_transfer");
});

test("is balanced by construction in both the unpaired and paired case", () => {
  for (const overrides of [{}, { destinationBankId: "bank-dest", destinationBankCoaId: "coa-bank-dest" }]) {
    const draft = buildInterbankTransferJournal(input(overrides));
    const totalDebit = draft.lines.reduce((s, l) => s + l.debitSen, 0n);
    const totalCredit = draft.lines.reduce((s, l) => s + l.creditSen, 0n);
    assert.equal(totalDebit, totalCredit);
  }
});
