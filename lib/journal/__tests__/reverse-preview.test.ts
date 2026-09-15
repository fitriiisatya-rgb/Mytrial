import { test } from "node:test";
import assert from "node:assert/strict";
import { previewReversalLines } from "../reverse-preview";

test("swaps debit and credit on every line, leaving accounts untouched", () => {
  const lines = [
    { coaId: "coa-expense", outletId: "outlet-1", bankAccountId: null, debitSen: 350000n, creditSen: 0n, description: "Adm Bank" },
    { coaId: "coa-bank", outletId: "outlet-1", bankAccountId: "bank-1", debitSen: 0n, creditSen: 350000n, description: "Adm Bank" },
  ];
  const reversed = previewReversalLines(lines);
  assert.equal(reversed[0]?.coaId, "coa-expense");
  assert.equal(reversed[0]?.debitSen, 0n);
  assert.equal(reversed[0]?.creditSen, 350000n);
  assert.equal(reversed[1]?.debitSen, 350000n);
  assert.equal(reversed[1]?.creditSen, 0n);
});

test("the reversal of a reversal returns to the original shape", () => {
  const lines = [{ coaId: "coa-a", outletId: null, bankAccountId: null, debitSen: 1000n, creditSen: 0n, description: null }];
  const twice = previewReversalLines(previewReversalLines(lines));
  assert.deepEqual(twice, lines);
});

test("the reversal is still balanced (same total, sides swapped)", () => {
  const lines = [
    { coaId: "coa-a", outletId: null, bankAccountId: null, debitSen: 700n, creditSen: 0n, description: null },
    { coaId: "coa-b", outletId: null, bankAccountId: null, debitSen: 0n, creditSen: 700n, description: null },
  ];
  const reversed = previewReversalLines(lines);
  const totalDebit = reversed.reduce((s, l) => s + l.debitSen, 0n);
  const totalCredit = reversed.reduce((s, l) => s + l.creditSen, 0n);
  assert.equal(totalDebit, totalCredit);
});
