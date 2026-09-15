export interface TransferCandidateRow {
  id: string;
  bankId: string;
  txnDate: string;
  debitSen: bigint;
}

export interface TransferSuggestion {
  destinationTransactionId: string;
  destinationBankId: string;
}

/**
 * Spec E: "Support transfer pairing suggestion jika architecture
 * memungkinkan" — a same-amount, different-bank, nearby-date debit
 * (incoming) row is a plausible destination for an interbank-flagged
 * credit (outgoing) row. Deliberately conservative: exact amount match
 * only (no fuzzy tolerance — a transfer fee would make the two sides
 * differ by a few thousand Rupiah, which this intentionally does NOT
 * paper over) and a narrow date window, never on a different entity's
 * bank. This is a suggestion only — pairing_status stays 'suggested'
 * until a human confirms it (never auto-confirmed, per spec).
 */
export function suggestTransferPair(
  source: { bankId: string; txnDate: string; creditSen: bigint },
  candidates: TransferCandidateRow[],
  maxDateWindowDays = 3
): TransferSuggestion | null {
  const sourceDate = new Date(source.txnDate);

  const matches = candidates.filter((c) => {
    if (c.bankId === source.bankId) return false; // never pair a bank with itself
    if (c.debitSen !== source.creditSen) return false; // exact amount only
    const days = Math.abs((new Date(c.txnDate).getTime() - sourceDate.getTime()) / 86_400_000);
    return days <= maxDateWindowDays;
  });

  if (matches.length !== 1) return null; // 0 = no candidate; 2+ = ambiguous, never guess
  return { destinationTransactionId: matches[0]!.id, destinationBankId: matches[0]!.bankId };
}
