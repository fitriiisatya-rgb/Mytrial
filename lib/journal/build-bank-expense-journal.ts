import { checkBalance, type JournalDraft } from "./types";

export interface BankExpenseJournalInput {
  bankTransactionId: string;
  importBatchId: string | null;
  entityId: string;
  txnDate: string;
  /** The outlet the Mapping Engine (Phase 4) resolved — null only for a
   * COA rule flagged no_outlet_needed (e.g. Prive, Angsuran). */
  detectedOutletId: string | null;
  /** The Mapping Engine's resolved expense COA — the Dr side. */
  detectedCoaId: string;
  bankId: string;
  /** The bank account's OWN ledger COA (banks.coa_id) — the Cr side.
   * Spec C: never a generic Kas & Bank account. */
  bankCoaId: string;
  creditSen: bigint;
  description: string | null;
}

/**
 * Spec C — Bank Expense Journal: Dr the mapped expense COA, Cr the
 * bank's own COA (never a shared/generic cash account — every bank
 * account has carried its own dedicated coa_id since Phase 1's
 * CORRECTION #1, and this is the first place in the whole pipeline that
 * actually posts against it). bank_account_id is stamped on the credit
 * line specifically so bank reconciliation (spec C, U) can join
 * journal_lines -> banks directly without reversing through coa.
 */
export function buildBankExpenseJournal(input: BankExpenseJournalInput): JournalDraft {
  if (input.creditSen <= 0n) {
    throw new Error(`buildBankExpenseJournal: amount must be positive, got ${input.creditSen}`);
  }

  const draft: JournalDraft = {
    journalDate: input.txnDate,
    sourceType: "bank_expense",
    sourceId: input.bankTransactionId,
    batchId: input.importBatchId,
    entityId: input.entityId,
    description: input.description,
    lines: [
      {
        coaId: input.detectedCoaId,
        entityId: input.entityId,
        outletId: input.detectedOutletId,
        bankAccountId: null,
        departmentId: null,
        costCenterId: null,
        debitSen: input.creditSen,
        creditSen: 0n,
        description: input.description,
      },
      {
        coaId: input.bankCoaId,
        entityId: input.entityId,
        outletId: input.detectedOutletId,
        bankAccountId: input.bankId,
        departmentId: null,
        costCenterId: null,
        debitSen: 0n,
        creditSen: input.creditSen,
        description: input.description,
      },
    ],
  };

  const check = checkBalance(draft.lines);
  if (!check.balanced) throw new Error(`buildBankExpenseJournal produced an unbalanced draft: ${check.errors.join("; ")}`);
  return draft;
}
