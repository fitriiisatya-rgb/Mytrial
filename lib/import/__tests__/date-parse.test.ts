import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImportDate } from "../date-parse";

test("parseImportDate reads DD/MM/YYYY as day-first (documented convention, never MM/DD)", () => {
  // day=5, month=3 — if this were read MM/DD it would be May 3rd instead.
  assert.equal(parseImportDate("05/03/2026").date, "2026-03-05");
});

test("parseImportDate reads unambiguous DD/MM/YYYY where day > 12", () => {
  assert.equal(parseImportDate("25/12/2026").date, "2026-12-25");
});

test("parseImportDate reads ISO YYYY-MM-DD", () => {
  assert.equal(parseImportDate("2026-03-05").date, "2026-03-05");
});

test("parseImportDate reads a day-month-name-year format", () => {
  assert.equal(parseImportDate("5 Mar 2026").date, "2026-03-05");
});

test("parseImportDate reads Indonesian month abbreviations (Mei, Agu, Okt, Des)", () => {
  assert.equal(parseImportDate("17 Agu 2026").date, "2026-08-17");
  assert.equal(parseImportDate("1 Mei 2026").date, "2026-05-01");
});

test("parseImportDate rejects a calendar date that doesn't exist (31 Feb)", () => {
  const result = parseImportDate("31/02/2026");
  assert.equal(result.date, null);
  assert.ok(result.error);
});

test("parseImportDate rejects an unrecognized format rather than guessing", () => {
  const result = parseImportDate("sometime in March");
  assert.equal(result.date, null);
  assert.ok(result.error);
});

test("parseImportDate rejects a blank date", () => {
  const result = parseImportDate("");
  assert.equal(result.date, null);
  assert.ok(result.error);
});

test("parseImportDate reads an Excel serial date number", () => {
  // 45658 is 2025-01-01 in Excel's day-count system.
  assert.equal(parseImportDate(45658).date, "2025-01-01");
});
