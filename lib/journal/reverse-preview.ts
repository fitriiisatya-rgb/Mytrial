export interface ReversibleLine {
  coaId: string;
  outletId: string | null;
  bankAccountId: string | null;
  debitSen: bigint;
  creditSen: bigint;
  description: string | null;
}

/**
 * Spec O: a reversal's lines are the exact opposite of the original —
 * same accounts, debit and credit swapped. The real reversal is created
 * server-side by fn_reverse_journal (0017), which does the identical
 * swap in SQL; this pure mirror exists so the UI can show "this is what
 * the reversal will look like" before the user confirms, without a
 * round-trip write.
 */
export function previewReversalLines(lines: ReversibleLine[]): ReversibleLine[] {
  return lines.map((l) => ({ ...l, debitSen: l.creditSen, creditSen: l.debitSen }));
}
