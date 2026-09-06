import { createHash } from "node:crypto";

/**
 * Fallback dedupe key when a source row carries no external reference.
 * bank_transactions_raw.dedupe_key / revenue_transactions_raw.dedupe_key
 * (0003) are generated columns that prefer external_ref and fall back to
 * this fingerprint — a unique constraint on dedupe_key is what actually
 * makes re-importing the same file a no-op (idempotency), this function
 * only has to be *stable*, not cryptographically anything.
 */
function stableFingerprint(parts: (string | null | undefined)[]): string {
  const normalized = parts.map((p) => (p ?? "").trim().toLowerCase()).join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function bankTransactionFingerprint(params: {
  source: string;
  bankLabel: string;
  date: string;
  classification: string | null;
  description: string | null;
  creditSen: bigint;
  /** Spec's minimum fingerprint fields don't list debit, since it only
   * ever discusses "kandidat pengeluaran" (credit > 0). But a
   * debit-only or blank-both row always has creditSen = 0, so without
   * debit two genuinely different deposits on the same day (same bank/
   * classification/description, different amounts) would collide on
   * fingerprint — this field is what keeps them distinct. */
  debitSen: bigint;
}): string {
  return stableFingerprint([
    params.source,
    params.bankLabel,
    params.date,
    params.classification,
    params.description,
    params.creditSen.toString(),
    params.debitSen.toString(),
  ]);
}

export function revenueTransactionFingerprint(params: {
  source: string;
  revenueSourceCode: string;
  date: string;
  outlet: string | null;
  description: string | null;
  amountSen: bigint;
}): string {
  return stableFingerprint([
    params.source,
    params.revenueSourceCode,
    params.date,
    params.outlet,
    params.description,
    params.amountSen.toString(),
  ]);
}
