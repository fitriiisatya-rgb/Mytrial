import { checkBalance, type JournalDraft } from "./types";

export interface InterbankTransferJournalInput {
  bankTransferId: string;
  importBatchId: string | null;
  entityId: string;
  transferDate: string;
  sourceBankId: string;
  /** The bank the money left — its own dedicated COA, never a generic
   * cash account (same rule as Bank Expense). */
  sourceBankCoaId: string;
  /** Known only once a destination bank_transactions_raw row has been
   * paired (bank_transfers.pairing_status = 'confirmed' with a
   * destination) — its bank's own COA. */
  destinationBankId: string | null;
  destinationBankCoaId: string | null;
  /** 1090 "Transfer Antar Bank/Unit (Clearing)" (seeded in Phase 1) —
   * used whenever the destination isn't known/confirmed yet. Spec E:
   * "Jika destination belum diketahui: gunakan transfer clearing
   * account sesuai design." */
  transferClearingCoaId: string;
  amountSen: bigint;
  description: string | null;
}

/**
 * Spec E — Interbank/Interunit Transfer: Dr destination bank (or the
 * clearing account when no destination is confirmed yet) / Cr source
 * bank. source_type is journal_source_type's own pre-existing
 * 'interbank_transfer' value — this NEVER uses an expense/revenue COA,
 * so a transfer can never leak into the P&L (spec E: "Jangan buat
 * transfer memengaruhi P&L") — the only accounts touched are bank
 * accounts and, at worst, the balance-sheet clearing account, never a
 * pnl_category-tagged COA.
 */
export function buildInterbankTransferJournal(input: InterbankTransferJournalInput): JournalDraft {
  if (input.amountSen <= 0n) {
    throw new Error(`buildInterbankTransferJournal: amount must be positive, got ${input.amountSen}`);
  }

  const destinationCoaId = input.destinationBankCoaId ?? input.transferClearingCoaId;
  const destinationBankAccountId = input.destinationBankCoaId ? input.destinationBankId : null;

  const draft: JournalDraft = {
    journalDate: input.transferDate,
    sourceType: "interbank_transfer",
    sourceId: input.bankTransferId,
    batchId: input.importBatchId,
    entityId: input.entityId,
    description: input.description,
    lines: [
      {
        coaId: destinationCoaId,
        entityId: input.entityId,
        outletId: null,
        bankAccountId: destinationBankAccountId,
        departmentId: null,
        costCenterId: null,
        debitSen: input.amountSen,
        creditSen: 0n,
        description: input.description,
      },
      {
        coaId: input.sourceBankCoaId,
        entityId: input.entityId,
        outletId: null,
        bankAccountId: input.sourceBankId,
        departmentId: null,
        costCenterId: null,
        debitSen: 0n,
        creditSen: input.amountSen,
        description: input.description,
      },
    ],
  };

  const check = checkBalance(draft.lines);
  if (!check.balanced) throw new Error(`buildInterbankTransferJournal produced an unbalanced draft: ${check.errors.join("; ")}`);
  return draft;
}
