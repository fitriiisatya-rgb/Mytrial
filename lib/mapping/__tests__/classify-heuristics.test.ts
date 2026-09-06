import { test } from "node:test";
import assert from "node:assert/strict";
import { isInterbankTransferCandidate, isSharedCostCandidate } from "../classify-heuristics";

test("'Mutasi antar unit' (the real Buku Bank export's own label) is detected as an interbank/interunit transfer candidate", () => {
  assert.equal(isInterbankTransferCandidate("Mutasi antar unit", "Pindah dana ke outlet lain"), true);
});

test("interbank detection is case-insensitive and also looks at the description, not just classification", () => {
  assert.equal(isInterbankTransferCandidate("Lain-lain", "TRANSFER ANTAR REKENING BCA ke Mandiri"), true);
});

test("a plain expense classification is never flagged as an interbank transfer", () => {
  assert.equal(isInterbankTransferCandidate("Listrik & Air", "Bayar listrik bulan Agustus"), false);
});

test("'Biaya Bersama' is detected as a shared cost candidate", () => {
  assert.equal(isSharedCostCandidate("Biaya Bersama Kantor Pusat", "Overhead operasional seluruh outlet"), true);
});

test("shared cost detection never fires on a plain single-outlet expense", () => {
  assert.equal(isSharedCostCandidate("Gaji", "Gaji staff outlet Ciparigi"), false);
});

test("a row matching interbank keywords is never also flagged shared cost by the same call (engine.ts arbitrates precedence, not this module)", () => {
  // classify-heuristics.ts intentionally evaluates both independently —
  // it is mapBankTransaction() in engine.ts that decides interbank wins
  // when both keyword sets happen to match the same text.
  assert.equal(isInterbankTransferCandidate("Mutasi antar unit", null), true);
});

test("blank classification and description never match either heuristic", () => {
  assert.equal(isInterbankTransferCandidate(null, null), false);
  assert.equal(isSharedCostCandidate(null, ""), false);
});
