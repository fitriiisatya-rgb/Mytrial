import { parseImportDate } from "./date-parse";
import { parseImportAmount } from "./money-parse";
import { revenueTransactionFingerprint } from "./fingerprint";
import { fromSen } from "@/lib/money";

export type RevenueRowStatus =
  | "valid"
  | "outlet_not_detected"
  | "invalid_date"
  | "invalid_amount"
  | "malformed_row"
  | "duplicate_exact"
  | "duplicate_suspected";

export interface RawRevenueRowInput {
  rowNumber: number;
  date: string | number | null;
  outlet: string | null;
  description: string | null;
  revenueCategory: string | null;
  amount: string | number | null;
  externalRef: string | null;
}

export interface ClassifiedRevenueRow {
  rowNumber: number;
  status: RevenueRowStatus;
  outletId: string | null;
  outletLabel: string | null;
  date: string | null;
  description: string | null;
  revenueCategory: string | null;
  amount: string;
  fingerprint: string;
  dedupeKey: string;
  externalRef: string | null;
  errorMessage?: string;
  insertable: boolean;
  raw: RawRevenueRowInput;
}

export interface ClassifyRevenueRowsResult {
  rows: ClassifiedRevenueRow[];
  summary: {
    totalRows: number;
    valid: number;
    outletNotDetected: number;
    invalidDate: number;
    invalidAmount: number;
    malformedRow: number;
    duplicateExact: number;
    duplicateSuspected: number;
  };
}

/** Revenue importer stores normalized source data only — no COA/journal
 * logic here (that's Phase 4's Mapping Engine / Auto Journal). */
export function classifyRevenueRows(params: {
  source: string;
  revenueSourceCode: string;
  rows: RawRevenueRowInput[];
  outlets: { id: string; outlet_code: string; outlet_name: string }[];
  existingDedupeKeys: Set<string>;
}): ClassifyRevenueRowsResult {
  const { source, revenueSourceCode, rows, outlets, existingDedupeKeys } = params;
  const seenInBatch = new Set<string>();
  const seenSuspectKeys = new Map<string, { rowNumber: number }>();
  const fingerprintOccurrences = new Map<string, number>();
  const classified: ClassifiedRevenueRow[] = [];

  const summary = {
    totalRows: 0,
    valid: 0,
    outletNotDetected: 0,
    invalidDate: 0,
    invalidAmount: 0,
    malformedRow: 0,
    duplicateExact: 0,
    duplicateSuspected: 0,
  };

  for (const row of rows) {
    const outletLabel = row.outlet?.trim() || null;
    const dateRaw = row.date == null ? "" : String(row.date).trim();
    const amountRaw = row.amount == null ? "" : String(row.amount).trim();
    // No date, no outlet, no amount — spreadsheet padding, not a source
    // row (see the matching check in classify-bank-row.ts).
    if (dateRaw === "" && !outletLabel && amountRaw === "") continue;

    summary.totalRows++;
    const { date, error: dateError } = parseImportDate(row.date);
    const { sen: amountSen, error: amountError } = parseImportAmount(row.amount);

    let status: RevenueRowStatus;
    let errorMessage: string | undefined;

    if (dateError) {
      status = "invalid_date";
      errorMessage = dateError;
    } else if (amountError) {
      status = "invalid_amount";
      errorMessage = amountError;
    } else if (amountSen === null) {
      status = "malformed_row";
      errorMessage = "Kolom Amount kosong.";
    } else if (amountSen < 0n) {
      status = "invalid_amount";
      errorMessage = "Amount tidak boleh negatif.";
    } else {
      status = "valid";
    }

    const outletMatch = outletLabel
      ? outlets.find(
          (o) =>
            o.outlet_name.toLowerCase() === outletLabel.toLowerCase() ||
            o.outlet_code.toLowerCase() === outletLabel.toLowerCase()
        )
      : undefined;
    if (status === "valid" && !outletMatch) {
      status = "outlet_not_detected";
      errorMessage = outletLabel
        ? `Outlet "${outletLabel}" tidak dikenali di Master Data.`
        : "Kolom Outlet kosong.";
    }

    const amount = amountSen ?? 0n;
    const baseFingerprint = revenueTransactionFingerprint({
      source,
      revenueSourceCode,
      date: date ?? "",
      outlet: outletLabel,
      description: row.description,
      amountSen: amount,
    });
    // Same reasoning as classify-bank-row.ts: several genuinely separate
    // revenue rows can share identical outlet/date/description/amount
    // within one file, so an occurrence index disambiguates them within
    // this run while still reproducing the same sequence (and therefore
    // the same idempotency against existingDedupeKeys) on a re-import of
    // the identical file.
    const occurrence = fingerprintOccurrences.get(baseFingerprint) ?? 0;
    fingerprintOccurrences.set(baseFingerprint, occurrence + 1);
    const fingerprint = occurrence === 0 ? baseFingerprint : `${baseFingerprint}::${occurrence}`;
    const dedupeKey = row.externalRef?.trim() || fingerprint;

    // Idempotency applies to every row that would actually be inserted
    // (everything except invalid_date) — not just clean/outlet-missing
    // rows, or a malformed/invalid-amount row would be re-inserted on
    // every re-import of the same file.
    if (status !== "invalid_date") {
      if (existingDedupeKeys.has(dedupeKey) || seenInBatch.has(dedupeKey)) {
        status = "duplicate_exact";
      } else {
        seenInBatch.add(dedupeKey);
      }
      // Suspected-duplicate heuristic stays scoped to real amounts
      // (valid/outlet_not_detected) — malformed/invalid-amount rows all
      // share amount=0, which would collide meaninglessly otherwise.
      if (status !== "duplicate_exact" && (status === "valid" || status === "outlet_not_detected")) {
        const suspectKey = `${outletMatch?.id ?? outletLabel}|${date}|${amount}`;
        const priorSuspect = seenSuspectKeys.get(suspectKey);
        if (priorSuspect) {
          status = "duplicate_suspected";
          errorMessage = `Mirip baris #${priorSuspect.rowNumber} (outlet, tanggal, dan nominal sama).`;
        } else {
          seenSuspectKeys.set(suspectKey, { rowNumber: row.rowNumber });
        }
      }
    }

    switch (status) {
      case "valid":
        summary.valid++;
        break;
      case "outlet_not_detected":
        summary.outletNotDetected++;
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
      outletId: outletMatch?.id ?? null,
      outletLabel,
      date,
      description: row.description,
      revenueCategory: row.revenueCategory,
      amount: fromSen(amount),
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
