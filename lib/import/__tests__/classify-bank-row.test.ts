import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBankRows, type RawBankRowInput } from "../classify-bank-row";

const banks = [{ id: "b1", bank_name: "BCA AMOR 352-3722227" }];

function row(overrides: Partial<RawBankRowInput> & { rowNumber: number }): RawBankRowInput {
  return {
    bank: "BCA AMOR 352-3722227",
    date: "01/03/2026",
    unit: null,
    classification: "Operasional",
    description: "Bayar listrik",
    debit: null,
    credit: "500000",
    balance: null,
    externalRef: null,
    ...overrides,
  };
}

test("credit > 0 is classified as an expense candidate", () => {
  const result = classifyBankRows({ source: "csv_upload", rows: [row({ rowNumber: 1 })], banks, existingDedupeKeys: new Set() });
  assert.equal(result.rows[0]?.status, "expense_candidate");
  assert.equal(result.summary.expenseCandidates, 1);
});

test("debit > 0 with blank credit is ignored, never treated as revenue", () => {
  const result = classifyBankRows({
    source: "csv_upload",
    rows: [row({ rowNumber: 1, debit: "200000", credit: null })],
    banks,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "debit_only_ignored");
  assert.equal(result.summary.debitOnlyIgnored, 1);
  assert.equal(result.summary.expenseCandidates, 0);
});

test("debit and credit both > 0 on one row is flagged malformed, not silently accepted", () => {
  const result = classifyBankRows({
    source: "csv_upload",
    rows: [row({ rowNumber: 1, debit: "100", credit: "100" })],
    banks,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "malformed_row");
  assert.equal(result.rows[0]?.insertable, true);
});

test("blank debit and blank credit is malformed, not a silent zero-amount expense", () => {
  const result = classifyBankRows({
    source: "csv_upload",
    rows: [row({ rowNumber: 1, debit: null, credit: null })],
    banks,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "malformed_row");
});

test("an unrecognized bank label is flagged bank_not_found but still recorded (insertable)", () => {
  const result = classifyBankRows({
    source: "csv_upload",
    rows: [row({ rowNumber: 1, bank: "Bank Tidak Dikenal" })],
    banks,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "bank_not_found");
  assert.equal(result.rows[0]?.insertable, true);
  assert.equal(result.rows[0]?.bankId, null);
});

test("an unparseable date is invalid_date and NOT insertable (no valid value for a NOT NULL DATE column)", () => {
  const result = classifyBankRows({
    source: "csv_upload",
    rows: [row({ rowNumber: 1, date: "not a date" })],
    banks,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "invalid_date");
  assert.equal(result.rows[0]?.insertable, false);
});

test("a row matching an existing dedupe key from the database is duplicate_exact and skipped", () => {
  const rows = [row({ rowNumber: 1 })];
  const draft = classifyBankRows({ source: "csv_upload", rows, banks, existingDedupeKeys: new Set() });
  const existingKey = draft.rows[0]!.dedupeKey;
  const result = classifyBankRows({ source: "csv_upload", rows, banks, existingDedupeKeys: new Set([existingKey]) });
  assert.equal(result.rows[0]?.status, "duplicate_exact");
});

test("re-classifying the identical file twice (idempotency) marks every row duplicate_exact the second time", () => {
  const rows = [row({ rowNumber: 1 }), row({ rowNumber: 2, description: "Bayar air" })];
  const first = classifyBankRows({ source: "csv_upload", rows, banks, existingDedupeKeys: new Set() });
  const dedupeKeys = new Set(first.rows.map((r) => r.dedupeKey));
  const second = classifyBankRows({ source: "csv_upload", rows, banks, existingDedupeKeys: dedupeKeys });
  assert.ok(second.rows.every((r) => r.status === "duplicate_exact"));
  assert.equal(second.summary.duplicateExact, 2);
});

test("idempotency also covers debit-only and malformed rows, not just expense candidates", () => {
  // Regression test: an earlier version only deduped
  // expense_candidate/bank_not_found rows, so a debit-only deposit or a
  // malformed row would be silently re-inserted on every re-import of
  // the same file.
  const rows = [
    row({ rowNumber: 1, debit: "200000", credit: null }), // debit_only_ignored
    row({ rowNumber: 2, debit: "50000", credit: "50000" }), // malformed_row (both > 0)
    row({ rowNumber: 3, debit: null, credit: null }), // malformed_row (both blank)
  ];
  const first = classifyBankRows({ source: "csv_upload", rows, banks, existingDedupeKeys: new Set() });
  assert.deepEqual(
    first.rows.map((r) => r.status),
    ["debit_only_ignored", "malformed_row", "malformed_row"]
  );
  const insertedKeys = new Set(first.rows.filter((r) => r.insertable).map((r) => r.dedupeKey));
  const second = classifyBankRows({ source: "csv_upload", rows, banks, existingDedupeKeys: insertedKeys });
  assert.ok(
    second.rows.every((r) => r.status === "duplicate_exact"),
    `expected every row duplicate_exact on re-import, got ${second.rows.map((r) => r.status).join(", ")}`
  );
});

test("two rows with the same bank/date/credit but different description are duplicate_suspected, not auto-skipped", () => {
  const rows = [
    row({ rowNumber: 1, description: "Bayar listrik" }),
    row({ rowNumber: 2, description: "Bayar listrik bulan ini" }),
  ];
  const result = classifyBankRows({ source: "csv_upload", rows, banks, existingDedupeKeys: new Set() });
  assert.equal(result.rows[0]?.status, "expense_candidate");
  assert.equal(result.rows[1]?.status, "duplicate_suspected");
  assert.equal(result.rows[1]?.insertable, true);
});

test("a negative credit amount is invalid_amount", () => {
  const result = classifyBankRows({
    source: "csv_upload",
    rows: [row({ rowNumber: 1, credit: "-100" })],
    banks,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "invalid_amount");
});

test("summary counts add up to the total number of rows classified", () => {
  const rows = [
    row({ rowNumber: 1 }),
    row({ rowNumber: 2, debit: "100", credit: null }),
    row({ rowNumber: 3, date: "garbage" }),
    row({ rowNumber: 4, bank: "" }),
  ];
  const result = classifyBankRows({ source: "csv_upload", rows, banks, existingDedupeKeys: new Set() });
  const s = result.summary;
  const sum =
    s.expenseCandidates + s.debitOnlyIgnored + s.bankNotFound + s.invalidDate + s.invalidAmount + s.malformedRow + s.duplicateExact + s.duplicateSuspected;
  assert.equal(sum, s.totalRows);
  assert.equal(s.totalRows, 4);
});
