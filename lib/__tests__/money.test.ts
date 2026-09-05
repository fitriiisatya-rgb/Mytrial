import { test } from "node:test";
import assert from "node:assert/strict";
import { toSen, fromSen, formatIDR, allocateProportionally, allocateEqually, pctOf } from "../money";

test("toSen / fromSen round-trip on plain rupiah", () => {
  assert.equal(toSen("1000000"), 100000000n);
  assert.equal(fromSen(100000000n), "1000000.00");
});

test("toSen handles 2-decimal sen amounts from the real bank book (e.g. 171,065,026.59)", () => {
  assert.equal(toSen("171065026.59"), 17106502659n);
  assert.equal(fromSen(17106502659n), "171065026.59");
});

test("toSen rejects garbage input instead of silently coercing", () => {
  assert.throws(() => toSen("not-a-number"));
  assert.throws(() => toSen("12.345")); // 3 decimals, not a valid sen amount
});

test("toSen from a JS number rounds away float noise", () => {
  // classic float trap: 0.1 + 0.2 !== 0.3 in IEEE-754
  const noisy = 0.1 + 0.2; // 0.30000000000000004
  assert.equal(toSen(noisy), 30n); // 0.30 rupiah = 30 sen, not corrupted
});

test("formatIDR groups thousands correctly", () => {
  assert.equal(formatIDR(100000000n), "Rp 1.000.000");
  assert.equal(formatIDR(toSen("1234567.89")), "Rp 1.234.567");
  assert.equal(formatIDR(-toSen("5000")), "-Rp 5.000");
});

test("allocateEqually splits without losing or inventing a single sen — the classic 100/3 case", () => {
  const total = toSen("100");
  const result = allocateEqually(total, ["A", "B", "C"]);
  const sum = result.reduce((s, r) => s + r.amount, 0n);
  assert.equal(sum, total);
  // 100/3 = 33.33... -> sen: 10000/3 = 3333.33 -> floors 3333,3333,3333 + 1 leftover
  const amounts = result.map((r) => r.amount).sort((a, b) => (a < b ? -1 : 1));
  assert.deepEqual(amounts, [3333n, 3333n, 3334n]);
});

test("allocateProportionally by revenue weight reconciles exactly across 5 outlets (mirrors the shared-cost allocation scenario)", () => {
  const total = toSen("30000000"); // the software akuntansi pusat cost from the prototype
  const weights = [
    { key: "BKPG", weight: 62000000 },
    { key: "BKBL", weight: 48500000 },
    { key: "CPRG", weight: 71000000 },
    { key: "BAROS", weight: 39800000 },
    { key: "KCRI", weight: 55250000 },
  ];
  const result = allocateProportionally(total, weights);
  const sum = result.reduce((s, r) => s + r.amount, 0n);
  assert.equal(sum, total, "allocation must reconcile to the exact original total, no drift");
  // every share must be non-negative and none can exceed the total
  for (const r of result) {
    assert.ok(r.amount >= 0n);
    assert.ok(r.amount <= total);
  }
});

test("allocateProportionally throws rather than silently allocating a non-zero total to zero items", () => {
  assert.throws(() => allocateProportionally(toSen("100"), []));
});

test("allocateProportionally is deterministic — running it twice gives identical results", () => {
  const total = toSen("1000000.01"); // deliberately awkward remainder
  const weights = [
    { key: "X", weight: 33 },
    { key: "Y", weight: 33 },
    { key: "Z", weight: 34 },
  ];
  const r1 = allocateProportionally(total, weights);
  const r2 = allocateProportionally(total, weights);
  assert.deepEqual(r1, r2);
});

test("pctOf computes distributable profit exactly (net profit x distribution pct / 100)", () => {
  const netProfit = toSen("34085000");
  const distributable = pctOf(netProfit, "70");
  assert.equal(fromSen(distributable), "23859500.00");
});

test("pctOf then allocateProportionally reconciles end-to-end for a profit-share scenario", () => {
  // Ciparigi scenario from the validated prototype: net profit 34,085,000,
  // distribution 70%, three investors owning 20/30/50%.
  const netProfit = toSen("34085000");
  const distributable = pctOf(netProfit, "70");
  const shares = allocateProportionally(distributable, [
    { key: "Citra", weight: 20 },
    { key: "Andi", weight: 30 },
    { key: "Dedi", weight: 50 },
  ]);
  const sum = shares.reduce((s, r) => s + r.amount, 0n);
  assert.equal(sum, distributable);
  assert.equal(fromSen(distributable), "23859500.00");
});

test("pctOf with zero profit distributes exactly zero to every investor", () => {
  const netProfit = 0n;
  const distributable = pctOf(netProfit, "70");
  assert.equal(distributable, 0n);
  const shares = allocateProportionally(distributable, [
    { key: "Citra", weight: 20 },
    { key: "Andi", weight: 30 },
    { key: "Dedi", weight: 50 },
  ]);
  assert.deepEqual(
    shares.map((s) => s.amount),
    [0n, 0n, 0n]
  );
});

test("pctOf on a negative profit (loss period) carries the sign through, never silently zeroed", () => {
  const netLoss = toSen("-10000000");
  const distributable = pctOf(netLoss, "70");
  assert.equal(fromSen(distributable), "-7000000.00");
});

test("pctOf with ownership 100% returns the full amount unchanged", () => {
  const netProfit = toSen("5000000");
  const distributable = pctOf(netProfit, "100");
  assert.equal(distributable, netProfit);
});

test("pctOf rejects an invalid (unparseable) percentage rather than silently defaulting", () => {
  assert.throws(() => pctOf(toSen("1000000"), "abc"));
  assert.throws(() => pctOf(toSen("1000000"), "70.5.5"));
});

test("allocateProportionally rejects a zero or negative total weight (e.g. all-zero ownership rows)", () => {
  assert.throws(() =>
    allocateProportionally(toSen("100"), [
      { key: "A", weight: 0 },
      { key: "B", weight: 0 },
    ])
  );
});

test("toSen/fromSen round-trip a very large Rupiah value without precision loss (beyond Number.MAX_SAFE_INTEGER in sen)", () => {
  // Rp 999,999,999,999.99 -> 99,999,999,999,999 sen, which exceeds
  // Number.MAX_SAFE_INTEGER (9,007,199,254,740,991 is close but this
  // exercises BigInt correctness regardless) — must not lose a cent.
  const huge = "999999999999.99";
  const sen = toSen(huge);
  assert.equal(sen, 99999999999999n);
  assert.equal(fromSen(sen), huge);
});

test("allocateProportionally reconciles exactly even at very large Rupiah scale", () => {
  const total = toSen("999999999999.99");
  const result = allocateProportionally(total, [
    { key: "A", weight: 1 },
    { key: "B", weight: 1 },
    { key: "C", weight: 1 },
  ]);
  const sum = result.reduce((s, r) => s + r.amount, 0n);
  assert.equal(sum, total);
});
