export function normalizeBankLabel(label: string): string {
  // Any run of non-alphanumeric characters (dash, dot, extra spaces)
  // collapses to a single space, so "352-3722227" and "352 3722227"
  // normalize identically instead of one gluing digits together.
  return label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/**
 * Correction #1: a bank expense row must resolve to one specific
 * bank_accounts row, never a generic fallback. Exact match first, then
 * a normalized (case/whitespace/punctuation-insensitive) match — no
 * fuzzy/similarity matching, so a genuinely-unrecognized label is never
 * silently attached to the wrong account.
 */
export function matchBank(
  label: string,
  banks: { id: string; bank_name: string }[]
): { bankId: string | null } {
  const exact = banks.find((b) => b.bank_name === label);
  if (exact) return { bankId: exact.id };

  const normalizedLabel = normalizeBankLabel(label);
  const normalized = banks.find((b) => normalizeBankLabel(b.bank_name) === normalizedLabel);
  return { bankId: normalized?.id ?? null };
}
