import { createHash } from "node:crypto";

/**
 * DO NOT DO #7 in the spec: never use a raw spreadsheet row number alone as
 * the unique key (rows get inserted/deleted in the sheet). This fingerprint
 * combines the sheet identity, transaction date, account, amount and
 * description — content that identifies the same real-world transaction
 * even if its row number shifts on the next sync.
 */
export function buildSourceFingerprint(input: {
  sourceSheet: string;
  sourceRowId: string;
  transactionDate: string;
  bankAccountId: string;
  cashIn: number;
  cashOut: number;
  description: string;
}): string {
  const raw = [
    input.sourceSheet.trim().toLowerCase(),
    input.sourceRowId.trim(),
    input.transactionDate,
    input.bankAccountId,
    input.cashIn.toFixed(2),
    input.cashOut.toFixed(2),
    input.description.trim().toLowerCase(),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}
