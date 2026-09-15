import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestTransferPair } from "../transfer-pairing";

test("finds a same-amount, different-bank, same-day debit as the destination candidate", () => {
  const result = suggestTransferPair(
    { bankId: "bank-a", txnDate: "2026-08-09", creditSen: 10000000n },
    [{ id: "candidate-1", bankId: "bank-b", txnDate: "2026-08-09", debitSen: 10000000n }]
  );
  assert.deepEqual(result, { destinationTransactionId: "candidate-1", destinationBankId: "bank-b" });
});

test("never pairs a bank with itself", () => {
  const result = suggestTransferPair(
    { bankId: "bank-a", txnDate: "2026-08-09", creditSen: 10000000n },
    [{ id: "candidate-1", bankId: "bank-a", txnDate: "2026-08-09", debitSen: 10000000n }]
  );
  assert.equal(result, null);
});

test("a different amount is never suggested, even off by a small transfer fee", () => {
  const result = suggestTransferPair(
    { bankId: "bank-a", txnDate: "2026-08-09", creditSen: 10000000n },
    [{ id: "candidate-1", bankId: "bank-b", txnDate: "2026-08-09", debitSen: 9995000n }]
  );
  assert.equal(result, null);
});

test("a candidate outside the date window is never suggested", () => {
  const result = suggestTransferPair(
    { bankId: "bank-a", txnDate: "2026-08-01", creditSen: 10000000n },
    [{ id: "candidate-1", bankId: "bank-b", txnDate: "2026-08-10", debitSen: 10000000n }]
  );
  assert.equal(result, null);
});

test("two equally-good candidates is ambiguous — never guessed", () => {
  const result = suggestTransferPair(
    { bankId: "bank-a", txnDate: "2026-08-09", creditSen: 10000000n },
    [
      { id: "candidate-1", bankId: "bank-b", txnDate: "2026-08-09", debitSen: 10000000n },
      { id: "candidate-2", bankId: "bank-c", txnDate: "2026-08-09", debitSen: 10000000n },
    ]
  );
  assert.equal(result, null);
});
