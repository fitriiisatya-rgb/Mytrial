import type { JournalSourceType } from "@/types/database.types";

export interface JournalLineDraft {
  coaId: string;
  entityId: string;
  outletId: string | null;
  bankAccountId: string | null;
  departmentId: string | null;
  costCenterId: string | null;
  debitSen: bigint;
  creditSen: bigint;
  description: string | null;
}

export interface JournalDraft {
  journalDate: string;
  sourceType: JournalSourceType;
  /** null only for a manual journal, which has no natural source row. */
  sourceId: string | null;
  batchId: string | null;
  entityId: string;
  description: string | null;
  lines: JournalLineDraft[];
}

export interface BalanceCheck {
  balanced: boolean;
  totalDebitSen: bigint;
  totalCreditSen: bigint;
  errors: string[];
}

/**
 * The one balance-check every journal builder runs on its own output
 * before returning it — a builder that ever produced an unbalanced
 * draft would be a bug in the builder, not something the database guard
 * should have to catch first. Also used directly by the Manual Journal
 * form, where the lines come from a human, not a builder, and really
 * can be wrong.
 */
export function checkBalance(lines: JournalLineDraft[]): BalanceCheck {
  const errors: string[] = [];
  if (lines.length < 2) errors.push("Jurnal harus memiliki minimal 2 baris.");

  for (const [i, line] of lines.entries()) {
    if (line.debitSen < 0n || line.creditSen < 0n) errors.push(`Baris ${i + 1}: debit/kredit tidak boleh negatif.`);
    if (line.debitSen > 0n && line.creditSen > 0n) errors.push(`Baris ${i + 1}: tidak boleh debit dan kredit sama-sama > 0.`);
    if (line.debitSen === 0n && line.creditSen === 0n) errors.push(`Baris ${i + 1}: debit dan kredit tidak boleh sama-sama 0.`);
  }

  const totalDebitSen = lines.reduce((sum, l) => sum + l.debitSen, 0n);
  const totalCreditSen = lines.reduce((sum, l) => sum + l.creditSen, 0n);
  if (totalDebitSen !== totalCreditSen) {
    errors.push(`Total debit (${totalDebitSen}) tidak sama dengan total kredit (${totalCreditSen}).`);
  }

  return { balanced: errors.length === 0, totalDebitSen, totalCreditSen, errors };
}
