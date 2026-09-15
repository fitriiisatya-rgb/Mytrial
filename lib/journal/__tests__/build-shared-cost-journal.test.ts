import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSharedCostJournal } from "../build-shared-cost-journal";

function input(overrides: Partial<Parameters<typeof buildSharedCostJournal>[0]> = {}) {
  return {
    bankTransactionId: "txn-shared-1",
    importBatchId: "batch-1",
    entityId: "entity-1",
    txnDate: "2026-08-06",
    expenseCoaId: "coa-shared-expense",
    bankId: "bank-hq",
    bankCoaId: "coa-bank-hq",
    amountSen: 500000000n, // Rp 5,000,000
    outlets: [{ outletId: "outlet-a" }, { outletId: "outlet-b" }, { outletId: "outlet-c" }],
    description: "Overhead operasional seluruh outlet",
    ...overrides,
  };
}

test("splits into one Dr line per outlet plus a single Cr line for the bank, balanced exactly", () => {
  const draft = buildSharedCostJournal(input());
  assert.equal(draft.sourceType, "allocation");
  assert.equal(draft.lines.length, 4); // 3 outlets + 1 bank line
  const drLines = draft.lines.filter((l) => l.debitSen > 0n);
  const crLines = draft.lines.filter((l) => l.creditSen > 0n);
  assert.equal(drLines.length, 3);
  assert.equal(crLines.length, 1);
  const totalDebit = draft.lines.reduce((s, l) => s + l.debitSen, 0n);
  const totalCredit = draft.lines.reduce((s, l) => s + l.creditSen, 0n);
  assert.equal(totalDebit, totalCredit);
  assert.equal(totalCredit, 500000000n);
});

test("an equal split of an amount that doesn't divide evenly still reconciles exactly (Rp100/3)", () => {
  const draft = buildSharedCostJournal(input({ amountSen: 10000n, outlets: [{ outletId: "a" }, { outletId: "b" }, { outletId: "c" }] }));
  const totalDebit = draft.lines.reduce((s, l) => s + l.debitSen, 0n);
  assert.equal(totalDebit, 10000n);
  // largest-remainder method: shares are as close to equal as integer sen allows.
  const amounts = draft.lines.filter((l) => l.debitSen > 0n).map((l) => l.debitSen).sort();
  assert.deepEqual(amounts, [3333n, 3333n, 3334n]);
});

test("a weighted (percentage-based) split reconciles exactly too", () => {
  const draft = buildSharedCostJournal(
    input({
      amountSen: 100000000n,
      outlets: [
        { outletId: "a", weight: 50 },
        { outletId: "b", weight: 30 },
        { outletId: "c", weight: 20 },
      ],
    })
  );
  const totalDebit = draft.lines.reduce((s, l) => s + l.debitSen, 0n);
  assert.equal(totalDebit, 100000000n);
});

test("every outlet's Dr line shares the same expense COA — only the outlet dimension differs", () => {
  const draft = buildSharedCostJournal(input());
  const drCoaIds = new Set(draft.lines.filter((l) => l.debitSen > 0n).map((l) => l.coaId));
  assert.deepEqual(drCoaIds, new Set(["coa-shared-expense"]));
});

test("a zero-weight outlet gets no line at all rather than an invalid 0/0 line", () => {
  const draft = buildSharedCostJournal(
    input({
      outlets: [
        { outletId: "a", weight: 60 },
        { outletId: "b", weight: 40 },
        { outletId: "c", weight: 0 },
      ],
    })
  );
  const outletIds = draft.lines.filter((l) => l.debitSen > 0n).map((l) => l.outletId).sort();
  assert.deepEqual(outletIds, ["a", "b"]);
});

test("fewer than 2 outlets is rejected — that isn't a real shared-cost split", () => {
  assert.throws(() => buildSharedCostJournal(input({ outlets: [{ outletId: "a" }] })));
});

test("a large amount still reconciles exactly across many outlets", () => {
  const outlets = Array.from({ length: 7 }, (_, i) => ({ outletId: `outlet-${i}` }));
  const draft = buildSharedCostJournal(input({ amountSen: 999999999999n, outlets }));
  const totalDebit = draft.lines.reduce((s, l) => s + l.debitSen, 0n);
  assert.equal(totalDebit, 999999999999n);
});
