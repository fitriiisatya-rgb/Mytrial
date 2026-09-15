import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRevenueJournal } from "../build-revenue-journal";

function input(overrides: Partial<Parameters<typeof buildRevenueJournal>[0]> = {}) {
  return {
    revenueTransactionId: "rev-1",
    importBatchId: "batch-1",
    entityId: "entity-1",
    txnDate: "2026-08-01",
    outletId: "outlet-1",
    clearingCoaId: "coa-clearing",
    revenueCoaId: "coa-revenue",
    amountSen: 1000000n,
    description: "Penjualan harian",
    ...overrides,
  };
}

test("Dr the configured clearing/receivable account, Cr Revenue — never hardcoded Dr Bank", () => {
  const draft = buildRevenueJournal(input());
  assert.equal(draft.sourceType, "revenue");
  assert.equal(draft.lines[0]?.coaId, "coa-clearing");
  assert.equal(draft.lines[0]?.debitSen, 1000000n);
  assert.equal(draft.lines[1]?.coaId, "coa-revenue");
  assert.equal(draft.lines[1]?.creditSen, 1000000n);
});

test("a different revenue source's configured clearing account produces a different Dr line, same shape", () => {
  const draft = buildRevenueJournal(input({ clearingCoaId: "coa-piutang-belum-settle" }));
  assert.equal(draft.lines[0]?.coaId, "coa-piutang-belum-settle");
});

test("the outlet dimension survives onto both lines", () => {
  const draft = buildRevenueJournal(input({ outletId: "outlet-42" }));
  assert.equal(draft.lines[0]?.outletId, "outlet-42");
  assert.equal(draft.lines[1]?.outletId, "outlet-42");
});

test("is balanced by construction", () => {
  const draft = buildRevenueJournal(input({ amountSen: 999999999n }));
  const totalDebit = draft.lines.reduce((s, l) => s + l.debitSen, 0n);
  const totalCredit = draft.lines.reduce((s, l) => s + l.creditSen, 0n);
  assert.equal(totalDebit, totalCredit);
});
