import { checkBalance, type JournalDraft, type JournalLineDraft } from "./types";

export interface ManualJournalLineInput {
  coaId: string;
  outletId: string | null;
  debitSen: bigint;
  creditSen: bigint;
  description: string | null;
}

export interface ManualJournalInput {
  entityId: string;
  journalDate: string;
  description: string | null;
  lines: ManualJournalLineInput[];
}

export interface ManualJournalResult {
  draft: JournalDraft | null;
  errors: string[];
}

/**
 * Spec P — Manual Journal: accrual, correction, depreciation, prepaid,
 * inventory adjustment, closing adjustment — any hand-entered journal.
 * Unlike every other builder here, the lines come directly from a
 * human, so this is the one place that actually returns validation
 * errors instead of throwing — the UI needs to show them back to the
 * user, not crash the request.
 */
export function buildManualJournal(input: ManualJournalInput): ManualJournalResult {
  const lines: JournalLineDraft[] = input.lines.map((l) => ({
    coaId: l.coaId,
    entityId: input.entityId,
    outletId: l.outletId,
    bankAccountId: null,
    departmentId: null,
    costCenterId: null,
    debitSen: l.debitSen,
    creditSen: l.creditSen,
    description: l.description,
  }));

  const check = checkBalance(lines);
  if (!check.balanced) {
    return { draft: null, errors: check.errors };
  }

  return {
    draft: {
      journalDate: input.journalDate,
      sourceType: "manual",
      sourceId: null,
      batchId: null,
      entityId: input.entityId,
      description: input.description,
      lines,
    },
    errors: [],
  };
}
