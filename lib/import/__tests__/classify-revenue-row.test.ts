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
