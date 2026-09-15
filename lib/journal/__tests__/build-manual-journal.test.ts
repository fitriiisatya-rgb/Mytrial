import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManualJournal } from "../build-manual-journal";

function baseInput(overrides: Partial<Parameters<typeof buildManualJournal>[0]> = {}) {
  return {
    entityId: "entity-1",
    journalDate: "2026-08-15",
    description: "Accrual bulan Agustus",
    lines: [
      { coaId: "coa-a", outletId: "outlet-1", debitSen: 100000n, creditSen: 0n, description: "Beban" },
      { coaId: "coa-b", outletId: null, debitSen: 0n, creditSen: 100000n, description: "Accrued liability" },
    ],
    ...overrides,
  };
}

test("a balanced manual journal produces a draft with no errors", () => {
  const result = buildManualJournal(baseInput());
  assert.deepEqual(result.errors, []);
  assert.equal(result.draft?.sourceType, "manual");
  assert.equal(result.draft?.sourceId, null);
});

test("an unbalanced manual journal returns errors instead of a draft, never throws", () => {
  const result = buildManualJournal(
    baseInput({ lines: [{ coaId: "coa-a", outletId: null, debitSen: 100n, creditSen: 0n, description: null }, { coaId: "coa-b", outletId: null, debitSen: 0n, creditSen: 50n, description: null }] })
  );
  assert.equal(result.draft, null);
  assert.ok(result.errors.length > 0);
});

test("a 0/0 line is rejected with a clear error", () => {
  const result = buildManualJournal(
    baseInput({ lines: [...baseInput().lines, { coaId: "coa-c", outletId: null, debitSen: 0n, creditSen: 0n, description: null }] })
  );
  assert.equal(result.draft, null);
  assert.ok(result.errors.some((e) => e.includes("sama-sama 0")));
});

test("a line with both debit and credit positive is rejected", () => {
  const result = buildManualJournal(baseInput({ lines: [{ coaId: "coa-a", outletId: null, debitSen: 100n, creditSen: 100n, description: null }] }));
  assert.equal(result.draft, null);
  assert.ok(result.errors.some((e) => e.includes("sama-sama > 0")));
});

test("fewer than 2 lines is rejected", () => {
  const result = buildManualJournal(baseInput({ lines: [{ coaId: "coa-a", outletId: null, debitSen: 100n, creditSen: 0n, description: null }] }));
  assert.equal(result.draft, null);
  assert.ok(result.errors.some((e) => e.includes("minimal 2 baris")));
});

test("a multi-line manual journal (e.g. depreciation across several accounts) balances correctly", () => {
  const result = buildManualJournal(
    baseInput({
      lines: [
        { coaId: "coa-a", outletId: null, debitSen: 40000n, creditSen: 0n, description: null },
        { coaId: "coa-b", outletId: null, debitSen: 60000n, creditSen: 0n, description: null },
        { coaId: "coa-c", outletId: null, debitSen: 0n, creditSen: 100000n, description: null },
      ],
    })
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.draft?.lines.length, 3);
});
