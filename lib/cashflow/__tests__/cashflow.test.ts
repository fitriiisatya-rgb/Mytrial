import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateEndingBalance, calculateExternalNetCashflow, calculateAccountBalance, calculateConsolidatedCashPosition } from "../balance";
import { calculateProjectedBalance } from "../projection";
import { buildSourceFingerprint } from "../fingerprint";
import { parseSheetAmount, parseSheetDate } from "../parse";
import { resolveColumnMap, getCell } from "../columnMapping";

// --- Spec section 31: Balance Calculation ---
test("ending balance: opening 100jt + cash in 50jt - cash out 20jt = 130jt", () => {
  assert.equal(calculateEndingBalance(100_000_000, 50_000_000, 20_000_000), 130_000_000);
});

// --- Spec section 31: Internal Transfer ---
test("internal transfer nets to zero on consolidated external cashflow, but still moves each account's own balance", () => {
  const transferOut = { type: "INTERNAL_TRANSFER_OUT" as const, cashIn: 0, cashOut: 100_000_000 };
  const transferIn = { type: "INTERNAL_TRANSFER_IN" as const, cashIn: 100_000_000, cashOut: 0 };

  // Per-account effect (RULE 1) — each leg still changes its own account balance.
  assert.equal(calculateAccountBalance({ accountId: "A", opening: 0, transactions: [transferOut] }), -100_000_000);
  assert.equal(calculateAccountBalance({ accountId: "B", opening: 0, transactions: [transferIn] }), 100_000_000);

  // Consolidated external net (RULE 3) — must be zero.
  assert.equal(calculateExternalNetCashflow([transferOut, transferIn]), 0);
});

test("consolidated cash position is the sum of each active account's own balance (RULE 2)", () => {
  assert.equal(calculateConsolidatedCashPosition([100_000_000, 250_000_000, 0]), 350_000_000);
});

// --- Spec section 31: Duplicate Sync (fingerprint idempotency) ---
test("the same source row produces the same fingerprint every time it is synced", () => {
  const row = {
    sourceSheet: "Master",
    sourceRowId: "42",
    transactionDate: "2026-08-05",
    bankAccountId: "acc-bca-amor",
    cashIn: 0,
    cashOut: 5_000_000,
    description: "Bayar Supplier ABC",
  };
  const first = buildSourceFingerprint(row);
  const second = buildSourceFingerprint(row);
  assert.equal(first, second, "re-syncing the identical row must yield the identical fingerprint so upsert is a no-op");
});

test("a different transaction (different amount) produces a different fingerprint", () => {
  const base = {
    sourceSheet: "Master", sourceRowId: "42", transactionDate: "2026-08-05",
    bankAccountId: "acc-bca-amor", cashIn: 0, cashOut: 5_000_000, description: "Bayar Supplier ABC",
  };
  const changed = buildSourceFingerprint({ ...base, cashOut: 6_000_000 });
  assert.notEqual(buildSourceFingerprint(base), changed);
});

// --- Spec section 31: Account Separation ---
test("a transaction on one account never affects another account's balance", () => {
  const bcaAmor = calculateAccountBalance({
    accountId: "bca-amor",
    opening: 100_000_000,
    transactions: [{ type: "CASH_OUT", cashIn: 0, cashOut: 20_000_000 }],
  });
  const mandiriAmor = calculateAccountBalance({
    accountId: "mandiri-amor",
    opening: 50_000_000,
    transactions: [],
  });
  assert.equal(bcaAmor, 80_000_000);
  assert.equal(mandiriAmor, 50_000_000, "Mandiri Amor balance must be untouched by BCA Amor's transaction");
});

// --- Spec section 31: Projection ---
test("projected balance: current 100jt + upcoming in 50jt - upcoming out 80jt = 70jt", () => {
  assert.equal(calculateProjectedBalance(100_000_000, 50_000_000, 80_000_000), 70_000_000);
});

// --- Column mapping / parsing sanity (supports the sync engine's robustness claims) ---
test("column mapping resolves aliased Indonesian headers regardless of exact wording", () => {
  const header = ["Tanggal", "Bank / Rekening", "Unit", "Klasifikasi", "Deskripsi", "Debit", "Kredit", "Saldo"];
  const map = resolveColumnMap(header);
  assert.equal(map.index.date, 0);
  assert.equal(map.index.bank, 1);
  assert.equal(map.index.debit, 5);
  assert.equal(map.index.kredit, 6);
  assert.equal(map.index.saldo, 7);

  const row = ["05/08/2026", "BCA AMOR", "HO", "Operasional", "Bayar listrik", "500000", "", "171065026,59"];
  assert.equal(getCell(row, map, "bank"), "BCA AMOR");
  assert.equal(parseSheetDate(getCell(row, map, "date")), "2026-08-05");
  assert.equal(parseSheetAmount(getCell(row, map, "debit")), 500000);
  assert.equal(parseSheetAmount(getCell(row, map, "kredit")), 0);
  assert.equal(parseSheetAmount(getCell(row, map, "saldo")), 171065026.59);
});

test("parseSheetAmount handles Indonesian thousands/decimal separators", () => {
  assert.equal(parseSheetAmount("1.234.567"), 1234567);
  assert.equal(parseSheetAmount("1.234.567,89"), 1234567.89);
  assert.equal(parseSheetAmount(""), 0);
  assert.equal(parseSheetAmount(undefined), 0);
  assert.equal(parseSheetAmount("not-a-number"), null);
});

test("parseSheetDate handles DD/MM/YYYY and ISO forms", () => {
  assert.equal(parseSheetDate("05/08/2026"), "2026-08-05");
  assert.equal(parseSheetDate("2026-08-05"), "2026-08-05");
  assert.equal(parseSheetDate("garbage"), null);
});
