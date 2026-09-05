import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImportAmount } from "../money-parse";

test("parseImportAmount reads Indonesian thousand-separator format (1.234.567,89)", () => {
  assert.equal(parseImportAmount("171.065.026,59").sen, 17106502659n);
});

test("parseImportAmount reads US thousand-separator format (1,234,567.89)", () => {
  assert.equal(parseImportAmount("171,065,026.59").sen, 17106502659n);
});

test("parseImportAmount reads a plain integer with no separators", () => {
  assert.equal(parseImportAmount("1000000").sen, 100000000n);
});

test("parseImportAmount treats a blank string as null, not zero", () => {
  const result = parseImportAmount("   ");
  assert.equal(result.sen, null);
  assert.equal(result.error, undefined);
});

test("parseImportAmount reads an explicit zero as zero, distinct from blank", () => {
  assert.equal(parseImportAmount("0").sen, 0n);
});

test("parseImportAmount reads a negative amount (leading minus)", () => {
  assert.equal(parseImportAmount("-500").sen, -50000n);
});

test("parseImportAmount reads accounting-style negative (parentheses)", () => {
  assert.equal(parseImportAmount("(500)").sen, -50000n);
});

test("parseImportAmount rejects non-numeric garbage with an error, never silently coerces", () => {
  const result = parseImportAmount("abc");
  assert.equal(result.sen, null);
  assert.ok(result.error);
});

test("parseImportAmount handles a JS number cell (from an Excel numeric column) without float drift", () => {
  assert.equal(parseImportAmount(1234.5).sen, 123450n);
});

test("parseImportAmount handles a very large Rupiah value exactly", () => {
  assert.equal(parseImportAmount("999.999.999.999,99").sen, 99999999999999n);
});
