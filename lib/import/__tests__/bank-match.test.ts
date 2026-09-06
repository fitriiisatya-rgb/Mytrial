import { test } from "node:test";
import assert from "node:assert/strict";
import { matchBank, normalizeBankLabel } from "../bank-match";

const banks = [
  { id: "b1", bank_name: "BCA AMOR 352-3722227" },
  { id: "b2", bank_name: "Mandiri-Outlet" },
];

test("matchBank finds an exact label match", () => {
  assert.equal(matchBank("BCA AMOR 352-3722227", banks).bankId, "b1");
});

test("matchBank finds a match despite different punctuation/spacing (dash vs space)", () => {
  assert.equal(matchBank("bca amor 352 3722227", banks).bankId, "b1");
  assert.equal(matchBank("BCA-AMOR-352-3722227", banks).bankId, "b1");
});

test("matchBank returns null for a genuinely unrecognized label — never a fuzzy guess", () => {
  assert.equal(matchBank("Bank Yang Tidak Ada", banks).bankId, null);
});

test("normalizeBankLabel collapses any run of punctuation/whitespace to one space", () => {
  assert.equal(normalizeBankLabel("  BCA   amor--352.3722227  "), "BCA AMOR 352 3722227");
});
