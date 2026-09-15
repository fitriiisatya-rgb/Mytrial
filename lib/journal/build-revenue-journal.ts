import { checkBalance, type JournalDraft } from "./types";

export interface RevenueJournalInput {
  revenueTransactionId: string;
  importBatchId: string | null;
  entityId: string;
  txnDate: string;
  outletId: string | null;
  /** revenue_sources.clearing_coa_id (Phase 1 CORRECTION #3) — the
   * configurable debit/receiving side: a real bank, a payment-gateway
   * clearing account, a receivable for unsettled sales, whatever this
   * revenue source's own configuration says. Never hardcoded to "Dr
   * Bank" here. */
  clearingCoaId: string;
  /** The credit-side Revenue COA — resolved by the caller (e.g. the
   * entity's configured revenue account), not fixed inside this
   * function either; spec D only requires the *debit* side to be
   * configurable per revenue source, not that the credit side must be
   * hardcoded here. */
  revenueCoaId: string;
  amountSen: bigint;
  description: string | null;
}

/**
 * Spec D — Revenue Journal: Dr <configured clearing/receivable account>,
 * Cr Revenue. Spec D explicitly requires the outlet dimension survive
 * onto the journal — set on both lines, matching how Bank Expense
 * carries it on both lines too.
 */
export function buildRevenueJournal(input: RevenueJournalInput): JournalDraft {
  if (input.amountSen <= 0n) {
    throw new Error(`buildRevenueJournal: amount must be positive, got ${input.amountSen}`);
  }

  const draft: JournalDraft = {
    journalDate: input.txnDate,
    sourceType: "revenue",
    sourceId: input.revenueTransactionId,
    batchId: input.importBatchId,
    entityId: input.entityId,
    description: input.description,
    lines: [
      {
        coaId: input.clearingCoaId,
        entityId: input.entityId,
        outletId: input.outletId,
        bankAccountId: null,
        departmentId: null,
        costCenterId: null,
        debitSen: input.amountSen,
        creditSen: 0n,
        description: input.description,
      },
      {
        coaId: input.revenueCoaId,
        entityId: input.entityId,
        outletId: input.outletId,
        bankAccountId: null,
        departmentId: null,
        costCenterId: null,
        debitSen: 0n,
        creditSen: input.amountSen,
        description: input.description,
      },
    ],
  };

  const check = checkBalance(draft.lines);
  if (!check.balanced) throw new Error(`buildRevenueJournal produced an unbalanced draft: ${check.errors.join("; ")}`);
  return draft;
}
