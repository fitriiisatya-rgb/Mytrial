import { test } from "node:test";
import assert from "node:assert/strict";
import { findSimilarRows } from "../similar";
import type { MappableBankRow } from "../types";

function row(overrides: Partial<MappableBankRow> = {}): MappableBankRow {
  return {
    bankId: "bank-1",
    unitRaw: null,
    classificationRaw: "Administrasi Bank",
    descriptionRaw: "Adm Bank",
    debitSen: 0n,
    creditSen: 350000n,
    detectedOutletId: null,
    ...overrides,
  };
}

test("same bank + identical classification is an exact_classification match, the real recurring-fee pattern", () => {
  const target = row();
  const candidates = [
    { id: "c1", row: row() },
    { id: "c2", row: row({ bankId: "bank-2" }) }, // different bank, excluded
  ];
  const result = findSimilarRows(target, candidates);
  assert.deepEqual(result, [{ id: "c1", confidence: "exact_classification" }]);
});

test("same bank with overlapping description words but a different classification is a lower-confidence description_keyword match", () => {
  const target = row({ classificationRaw: "Lain-lain", descriptionRaw: "Pembayaran gaji staff outlet ciparigi" });
  const candidates = [{ id: "c1", row: row({ classificationRaw: "Gaji", descriptionRaw: "Pembayaran gaji staff outlet bekasi" }) }];
  const result = findSimilarRows(target, candidates);
  assert.deepEqual(result, [{ id: "c1", confidence: "description_keyword" }]);
});

test("a completely unrelated row is not suggested at all", () => {
  const target = row();
  const candidates = [{ id: "c1", row: row({ classificationRaw: "Marketing", descriptionRaw: "Iklan Instagram bulan ini" }) }];
  assert.deepEqual(findSimilarRows(target, candidates), []);
});

test("blank classification never counts as an exact_classification match by coincidence", () => {
  const target = row({ classificationRaw: "" });
  const candidates = [{ id: "c1", row: row({ classificationRaw: "" }) }];
  assert.deepEqual(findSimilarRows(target, candidates), []);
});
