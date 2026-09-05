import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRevenueRows, type RawRevenueRowInput } from "../classify-revenue-row";

const outlets = [{ id: "o1", outlet_code: "BKPG", outlet_name: "Outlet Bekasi Pondok Gede" }];

function row(overrides: Partial<RawRevenueRowInput> & { rowNumber: number }): RawRevenueRowInput {
  return {
    date: "01/03/2026",
    outlet: "BKPG",
    description: "Penjualan harian",
    revenueCategory: "POS",
    amount: "1000000",
    externalRef: null,
    ...overrides,
  };
}

test("a clean row with a recognized outlet is valid", () => {
  const result = classifyRevenueRows({
    source: "csv_upload",
    revenueSourceCode: "POS_CASH",
    rows: [row({ rowNumber: 1 })],
    outlets,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "valid");
  assert.equal(result.rows[0]?.outletId, "o1");
});

test("an unrecognized outlet is flagged but still recorded (insertable)", () => {
  const result = classifyRevenueRows({
    source: "csv_upload",
    revenueSourceCode: "POS_CASH",
    rows: [row({ rowNumber: 1, outlet: "Outlet Tidak Ada" })],
    outlets,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "outlet_not_detected");
  assert.equal(result.rows[0]?.insertable, true);
  assert.equal(result.rows[0]?.outletId, null);
});

test("negative amount is invalid_amount", () => {
  const result = classifyRevenueRows({
    source: "csv_upload",
    revenueSourceCode: "POS_CASH",
    rows: [row({ rowNumber: 1, amount: "-500" })],
    outlets,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "invalid_amount");
});

test("blank amount is malformed_row, not silently zero", () => {
  const result = classifyRevenueRows({
    source: "csv_upload",
    revenueSourceCode: "POS_CASH",
    rows: [row({ rowNumber: 1, amount: null })],
    outlets,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "malformed_row");
});

test("unparseable date is invalid_date and not insertable", () => {
  const result = classifyRevenueRows({
    source: "csv_upload",
    revenueSourceCode: "POS_CASH",
    rows: [row({ rowNumber: 1, date: "garbage" })],
    outlets,
    existingDedupeKeys: new Set(),
  });
  assert.equal(result.rows[0]?.status, "invalid_date");
  assert.equal(result.rows[0]?.insertable, false);
});

test("re-importing the identical rows is idempotent — everything lands duplicate_exact", () => {
  const rows = [row({ rowNumber: 1 }), row({ rowNumber: 2, description: "Penjualan sore" })];
  const first = classifyRevenueRows({ source: "csv_upload", revenueSourceCode: "POS_CASH", rows, outlets, existingDedupeKeys: new Set() });
  const keys = new Set(first.rows.map((r) => r.dedupeKey));
  const second = classifyRevenueRows({ source: "csv_upload", revenueSourceCode: "POS_CASH", rows, outlets, existingDedupeKeys: keys });
  assert.ok(second.rows.every((r) => r.status === "duplicate_exact"));
});

test("several genuinely separate rows sharing identical outlet/date/description/amount are NOT flagged duplicate_exact of each other", () => {
  const rows = [row({ rowNumber: 1 }), row({ rowNumber: 2 }), row({ rowNumber: 3 })];
  const result = classifyRevenueRows({
    source: "csv_upload",
    revenueSourceCode: "POS_CASH",
    rows,
    outlets,
    existingDedupeKeys: new Set(),
  });
  // Never duplicate_exact (which would be silently skipped at commit) —
  // the 2nd/3rd occurrence legitimately lands duplicate_suspected instead
  // (same outlet+date+amount as a prior row), which is only ever flagged
  // for human review, still inserted (insertable stays true).
  assert.deepEqual(
    result.rows.map((r) => r.status),
    ["valid", "duplicate_suspected", "duplicate_suspected"]
  );
  assert.ok(result.rows.every((r) => r.insertable));
  assert.equal(result.summary.duplicateExact, 0);
  const dedupeKeys = result.rows.map((r) => r.dedupeKey);
  assert.equal(new Set(dedupeKeys).size, 3, "each occurrence must get a distinct dedupeKey");
});

test("re-importing a file with repeated identical rows still dedupes every one on the second run", () => {
  const rows = [row({ rowNumber: 1 }), row({ rowNumber: 2 }), row({ rowNumber: 3 })];
  const first = classifyRevenueRows({
    source: "csv_upload",
    revenueSourceCode: "POS_CASH",
    rows,
    outlets,
    existingDedupeKeys: new Set(),
  });
  const dedupeKeys = new Set(first.rows.map((r) => r.dedupeKey));
  const second = classifyRevenueRows({
    source: "csv_upload",
    revenueSourceCode: "POS_CASH",
    rows,
    outlets,
    existingDedupeKeys: dedupeKeys,
  });
  assert.ok(second.rows.every((r) => r.status === "duplicate_exact"));
  assert.equal(second.summary.duplicateExact, 3);
});
