/**
 * CORRECTION #7 — financial precision.
 *
 * Rupiah is stored in Postgres as NUMERIC(18,2) (never float8/real).
 * On the application side we treat every amount as an INTEGER number of
 * "sen" (1 Rupiah = 100 sen) for the duration of any arithmetic, and only
 * format back to a decimal string at the boundary. This makes every
 * operation exact — no IEEE-754 rounding can creep into a sum, a
 * percentage split, or a proportional allocation.
 *
 * allocateProportionally() is the one function every allocation/profit
 * distribution calculation must go through. It guarantees
 * sum(result) === total exactly, using the largest-remainder method so
 * any leftover sen is assigned deterministically (not to whichever row
 * happens to round up under floating point).
 */

/** Rupiah amount as a decimal string or number, e.g. 1000000 or "1000000.50" */
export type RupiahInput = number | string;

/** Integer number of sen. This is the only unit arithmetic is done in. */
export type Sen = bigint;

const SEN_PER_RUPIAH = 100n;

/** Parse a Rupiah amount (number or decimal string) into integer sen. Throws on NaN/garbage input rather than silently coercing. */
export function toSen(value: RupiahInput): Sen {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`toSen: non-finite number ${value}`);
    }
    // Round to nearest sen before converting — a number source (e.g. a
    // NUMERIC(18,2) read back as JS number) can carry float noise at the
    // 3rd+ decimal place; we do not propagate that noise.
    return BigInt(Math.round(value * 100));
  }
  const trimmed = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`toSen: cannot parse "${value}" as a Rupiah amount`);
  }
  const [, sign = "", whole = "0", frac = ""] = match;
  const fracPadded = (frac + "00").slice(0, 2);
  const sen = BigInt(whole) * SEN_PER_RUPIAH + BigInt(fracPadded || "0");
  return sign === "-" ? -sen : sen;
}

/** Format integer sen back to a plain decimal Rupiah string, e.g. "1000000.50" — the shape Postgres NUMERIC(18,2) expects. */
export function fromSen(sen: Sen): string {
  const negative = sen < 0n;
  const abs = negative ? -sen : sen;
  const whole = abs / SEN_PER_RUPIAH;
  const frac = abs % SEN_PER_RUPIAH;
  const fracStr = frac.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`;
}

/** Convenience: format sen as a whole-Rupiah display string with thousands separators, e.g. "Rp 1.000.000". Sen fraction is truncated for display only — never for storage/calculation. */
export function formatIDR(sen: Sen): string {
  const negative = sen < 0n;
  const abs = negative ? -sen : sen;
  const whole = abs / SEN_PER_RUPIAH;
  const grouped = whole
    .toString()
    .split("")
    .reverse()
    .reduce((acc, digit, i) => (i > 0 && i % 3 === 0 ? digit + "." + acc : digit + acc), "");
  return `${negative ? "-" : ""}Rp ${grouped}`;
}

export interface Weighted<T> {
  key: T;
  /** Non-negative weight — a percentage, a revenue figure, a headcount, anything comparable. */
  weight: Sen | bigint | number;
}

export interface AllocatedShare<T> {
  key: T;
  amount: Sen;
}

/**
 * Split `total` (sen) proportionally across `items` by weight, guaranteeing
 * the sum of results equals `total` exactly.
 *
 * Method: compute each share's exact rational value, floor it, then hand
 * out the leftover sen one at a time — largest fractional remainder first,
 * ties broken by input order — until the leftover is exhausted. This is
 * the standard "largest remainder method" used in seat-apportionment and
 * currency-splitting problems specifically because it is deterministic and
 * never depends on floating-point comparison.
 */
export function allocateProportionally<T>(total: Sen, items: Weighted<T>[]): AllocatedShare<T>[] {
  if (items.length === 0) {
    if (total !== 0n) throw new Error("allocateProportionally: no items to allocate a non-zero total to");
    return [];
  }
  const weights = items.map((i) => BigInt(Math.round(Number(i.weight) * 1_000_000)));
  const totalWeight = weights.reduce((a, b) => a + b, 0n);
  if (totalWeight <= 0n) {
    throw new Error("allocateProportionally: total weight must be positive");
  }

  const floors: Sen[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];
  let allocatedSoFar = 0n;

  weights.forEach((w, i) => {
    const rawNumerator = total * w; // exact, no precision loss (BigInt)
    const floor = rawNumerator / totalWeight;
    const remainder = rawNumerator % totalWeight;
    floors.push(floor);
    remainders.push({ index: i, remainder });
    allocatedSoFar += floor;
  });

  let leftover = total - allocatedSoFar;
  if (leftover < 0n) {
    // Cannot happen mathematically (floor <= true value), guarded for safety.
    throw new Error("allocateProportionally: internal invariant violated (negative leftover)");
  }

  // Largest remainder first; stable tie-break by original index.
  remainders.sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });

  for (const { index } of remainders) {
    if (leftover === 0n) break;
    floors[index] = floors[index]! + 1n;
    leftover -= 1n;
  }

  const result = items.map((item, i) => ({ key: item.key, amount: floors[i]! }));

  // Self-check — this must always hold; if it doesn't, fail loudly rather
  // than silently post an unbalanced allocation journal.
  const sum = result.reduce((a, r) => a + r.amount, 0n);
  if (sum !== total) {
    throw new Error(`allocateProportionally: reconciliation failed (${sum} !== ${total})`);
  }
  return result;
}

/** Equal-split convenience wrapper over allocateProportionally. */
export function allocateEqually<T>(total: Sen, keys: T[]): AllocatedShare<T>[] {
  return allocateProportionally(
    total,
    keys.map((key) => ({ key, weight: 1 }))
  );
}

/** Percentage-of-total helper used by profit distribution (e.g. distributable = netProfit * distributionPct / 100), rounded to the nearest sen — never truncated silently, never a float multiply. */
export function pctOf(amount: Sen, pct: RupiahInput): Sen {
  // pct may be e.g. "70" or "70.5" — treat as a decimal number with up to
  // 3 fractional digits of precision for the percentage itself.
  const pctStr = typeof pct === "number" ? pct.toString() : pct.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(pctStr);
  if (!match) throw new Error(`pctOf: cannot parse percentage "${pct}"`);
  const [, sign = "", whole = "0", frac = ""] = match;
  const fracPadded = (frac + "000000").slice(0, 6);
  const pctMicros = BigInt(whole) * 1_000_000n + BigInt(fracPadded || "0");
  const signedPctMicros = sign === "-" ? -pctMicros : pctMicros;
  const numerator = amount * signedPctMicros;
  const denominator = 100_000_000n; // 100 * 1e6
  // Round-half-up on the integer division to stay deterministic.
  const negative = numerator < 0n;
  const absNumerator = negative ? -numerator : numerator;
  const rounded = (absNumerator + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}
