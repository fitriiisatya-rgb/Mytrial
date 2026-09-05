import { parseImportDate } from "./date-parse";
import { parseImportAmount } from "./money-parse";
import { matchBank } from "./bank-match";
import { bankTransactionFingerprint } from "./fingerprint";
import { fromSen } from "@/lib/money";

export type BankRowStatus =
  | "expense_candidate"
  | "debit_only_ignored"
  | "bank_not_found"
  | "invalid_date"
  | "invalid_amount"
  | "malformed_row"
  | "duplicate_exact"
  | "duplicate_suspected";

export interface RawBankRowInput {
  rowNumber: number;
  bank: string | null;
  date: string | number | null;
  unit: string | null;
  classification: string | null;
  description: string | null;
  debit: string | number | null;
  credit: string | number | null;
  balance: string | number | null;
  externalRef: string | null;
}

export interface ClassifiedBankRow {
  rowNumber: number;
  status: BankRowStatus;
  bankId: string | null;
  bankLabel: string;
  date: string | null;
  unit: string | null;
  classification: string | null;
  description: string | null;
  debit: string; // Rupiah decimal string, never a JS float
  credit: string;
  balance: string | null;
  fingerprint: string;
  dedupeKey: string;
  externalRef: string | null;
  errorMessage?: string;
  /** false only for invalid_date — bank_transactions_raw.txn_date is
   * NOT NULL with no sensible default, so a row whose date could not be
   * parsed at all has nothing valid to store and is reported only via
   * import_row_errors, never as a raw row. Every other status (even
   * invalid_amount, malformed_row, bank_not_found) still has a row worth
   * keeping — numeric columns default to 0 and bank_id is nullable. */
  insertable: boolean;
  raw: RawBankRowInput;
}

export interface ClassifyBankRowsResult {
  rows: ClassifiedBankRow[];
  summary: {
    totalRows: number;
    expenseCandidates: number;
    debitOnlyIgnored: number;
    bankNotFound: number;
    invalidDate: number;
    invalidAmount: number;
    malformedRow: number;
    duplicateExact: number;
    duplicateSuspected: number;
  };
}

/**
 * Pure classification — no DB access. Called identically by the preview
 * step (dry run) and the commit step (same result, then only
 * non-duplicate/non-error rows are actually inserted), so "what you
 * previewed is exactly what gets imported" is true by construction, not
 * by keeping two code paths in sync by hand.
 */
export function classifyBankRows(params: {
  source: string;
  rows: RawBankRowInput[];
  banks: { id: string; bank_name: string }[];
  existingDedupeKeys: Set<string>;
}): ClassifyBankRowsResult {
  const { source, rows, banks, existingDedupeKeys } = params;
  const seenInBatch = new Set<string>();
  const seenSuspectKeys = new Map<string, { rowNumber: number }>();
  const fingerprintOccurrences = new Map<string, number>();
  const classified: ClassifiedBankRow[] = [];

  const summary = {
    totalRows: 0,
    expenseCandidates: 0,
    debitOnlyIgnored: 0,
    bankNotFound: 0,
    invalidDate: 0,
    invalidAmount: 0,
    malformedRow: 0,
    duplicateExact: 0,
    duplicateSuspected: 0,
  };

  for (const row of rows) {
    const bankLabel = (row.bank ?? "").trim();
    const dateRaw = row.date == null ? "" : String(row.date).trim();
    const debitRaw = row.debit == null ? "" : String(row.debit).trim();
    const creditRaw = row.credit == null ? "" : String(row.credit).trim();
    // A row with no bank, no date, and no amounts carries no transaction
    // at all — typically a Saldo/running-balance formula copied down
    // past the last real entry in a spreadsheet export (confirmed
    // against a real Buku Bank file: 90+ such rows, all trailing/
    // interspersed padding). Never counted at all, not even toward
    // totalRows — it isn't a source row to begin with, so it can't be a
    // malformed one either.
    if (bankLabel === "" && dateRaw === "" && debitRaw === "" && creditRaw === "") continue;

    summary.totalRows++;
    const { date, error: dateError } = parseImportDate(row.date);
    const { sen: debitSen, error: debitError } = parseImportAmount(row.debit);
    const { sen: creditSen, error: creditError } = parseImportAmount(row.credit);
    const { sen: balanceSen } = parseImportAmount(row.balance);

    const debit = debitSen ?? 0n;
    const credit = creditSen ?? 0n;

    let status: BankRowStatus;
    let errorMessage: string | undefined;

    if (bankLabel === "") {
      status = "malformed_row";
      errorMessage = "Kolom Bank kosong.";
    } else if (dateError) {
      status = "invalid_date";
      errorMessage = dateError;
    } else if (debitError || creditError) {
      status = "invalid_amount";
      errorMessage = debitError ?? creditError;
    } else if (debit < 0n || credit < 0n) {
      status = "invalid_amount";
      errorMessage = "Nilai debit/kredit tidak boleh negatif.";
    } else if (debitSen === null && creditSen === null) {
      status = "malformed_row";
      errorMessage = "Debit dan Kredit sama-sama kosong.";
    } else if (debit > 0n && credit > 0n) {
      status = "malformed_row";
      errorMessage = "Debit dan Kredit sama-sama lebih dari 0 pada satu baris.";
    } else if (credit === 0n) {
      status = "debit_only_ignored";
    } else {
      status = "expense_candidate";
    }

    const { bankId } = bankLabel ? matchBank(bankLabel, banks) : { bankId: null };
    if (status === "expense_candidate" && !bankId) {
      status = "bank_not_found";
      errorMessage = `Rekening bank "${bankLabel}" tidak dikenali di Master Data.`;
    }

    const baseFingerprint = bankTransactionFingerprint({
      source,
      bankLabel,
      date: date ?? "",
      classification: row.classification,
      description: row.description,
      creditSen: credit,
      debitSen: debit,
    });
    // Real Buku Bank exports contain many genuinely separate transactions
    // that share identical bank/date/classification/description/amounts
    // (e.g. several same-day Rp 3,500 "Administrasi Bank" fees, confirmed
    // distinct via the running Saldo column each strictly decrementing).
    // A content-only fingerprint can't tell those apart from a true
    // duplicate, so each occurrence of the same base fingerprint within
    // this run gets a distinct index appended. Re-importing the
    // identical file reproduces the same sequence of indices in the same
    // row order, so idempotency against existingDedupeKeys still holds —
    // only within-run collisions between distinct legitimate rows are
    // eliminated.
    const occurrence = fingerprintOccurrences.get(baseFingerprint) ?? 0;
    fingerprintOccurrences.set(baseFingerprint, occurrence + 1);
    const fingerprint = occurrence === 0 ? baseFingerprint : `${baseFingerprint}::${occurrence}`;
    const dedupeKey = row.externalRef?.trim() || fingerprint;

    // Idempotency applies to every row that would actually be inserted
    // (i.e. every status except invalid_date, which never reaches the
    // raw table at all) — not just expense candidates. A debit-only,
    // malformed, or invalid-amount row re-imported from the same file
    // must not be re-inserted either, or the raw table silently grows a
    // second copy of it on every re-run.
    if (status !== "invalid_date") {
      if (existingDedupeKeys.has(dedupeKey) || seenInBatch.has(dedupeKey)) {
        status = "duplicate_exact";
      } else {
        seenInBatch.add(dedupeKey);
      }
      // Suspected duplicate is scoped to real expense amounts (credit >
      // 0) only — debit-only/malformed rows all share credit=0, so the
      // same bank+date+0 heuristic would flag unrelated rows against
      // each other for no reason.
      if (status !== "duplicate_exact" && (status === "expense_candidate" || status === "bank_not_found")) {
        // Suspected duplicate: same bank + date + credit amount as
        // another row already seen, but not an exact fingerprint match
        // (different description/classification) — flagged for human
        // review, never auto-skipped.
        const suspectKey = `${bankId ?? bankLabel}|${date}|${credit}`;
        const priorSuspect = seenSuspectKeys.get(suspectKey);
        if (priorSuspect) {
          status = "duplicate_suspected";
          errorMessage = `Mirip baris #${priorSuspect.rowNumber} (bank, tanggal, dan nominal kredit sama).`;
        } else {
          seenSuspectKeys.set(suspectKey, { rowNumber: row.rowNumber });
        }
      }
    }

    switch (status) {
      case "expense_candidate":
        summary.expenseCandidates++;
        break;
      case "debit_only_ignored":
        summary.debitOnlyIgnored++;
        break;
      case "bank_not_found":
        summary.bankNotFound++;
        break;
      case "invalid_date":
        summary.invalidDate++;
        break;
      case "invalid_amount":
        summary.invalidAmount++;
        break;
      case "malformed_row":
        summary.malformedRow++;
        break;
      case "duplicate_exact":
        summary.duplicateExact++;
        break;
      case "duplicate_suspected":
        summary.duplicateSuspected++;
        break;
    }

    classified.push({
      rowNumber: row.rowNumber,
      status,
      bankId,
      bankLabel,
      date,
      unit: row.unit,
      classification: row.classification,
      description: row.description,
      debit: fromSen(debit),
      credit: fromSen(credit),
      balance: balanceSen !== null ? fromSen(balanceSen) : null,
      fingerprint,
      dedupeKey,
      externalRef: row.externalRef?.trim() || null,
      errorMessage,
      insertable: status !== "invalid_date",
      raw: row,
    });
  }

  return { rows: classified, summary };
}
