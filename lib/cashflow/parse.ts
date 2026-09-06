/**
 * Defensive parsing for values coming out of a human-edited Google Sheet.
 * Never throw on garbage — return null and let the caller route the row to
 * sync_errors (data quality layer), per RULE: "jangan silently discard".
 */

/** Parse an amount that may be Indonesian-formatted ("1.234.567,89"), plain ("1234567.89"), or empty. */
export function parseSheetAmount(raw: string | undefined): number | null {
  if (raw === undefined) return 0; // an empty debit/kredit cell means zero, not an error
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") return 0;

  // Strip currency symbols/spaces.
  let cleaned = trimmed.replace(/[Rr]p\.?/g, "").replace(/\s/g, "");
  const negative = /^\(.*\)$/.test(cleaned) || cleaned.startsWith("-");
  cleaned = cleaned.replace(/[()-]/g, "");

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal separator.
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Only commas: treat as thousands separators unless it looks like a decimal (2 digits after last comma).
    const parts = cleaned.split(",");
    if (parts.length === 2 && (parts[1]?.length ?? 0) <= 2) {
      cleaned = parts.join(".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = cleaned.replace(/\./g, "");
    } else if (parts.length === 2 && (parts[1]?.length ?? 0) === 3) {
      // Ambiguous "1.234" — treat 3-digit groups as thousands, not decimals,
      // matching the Indonesian source convention.
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

/** Parse a transaction date cell into an ISO yyyy-mm-dd string, or null if unparseable. Supports DD/MM/YYYY, YYYY-MM-DD, "5 Sep 2026", and Google Sheets serial date numbers. */
export function parseSheetDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Google Sheets serial date (days since 1899-12-30), sometimes surfaced by the API for numeric-formatted date cells.
  if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const ms = epoch + Math.round(serial) * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (m) return isoFrom(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (m) return isoFrom(Number(m[3]), Number(m[2]), Number(m[1])); // DD/MM/YYYY (Indonesian convention)

  m = /^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{4})$/.exec(trimmed);
  if (m) {
    const monthKey = m[2]!.slice(0, 3).toLowerCase();
    const month = MONTHS[monthKey];
    if (month) return isoFrom(Number(m[3]), month, Number(m[1]));
  }

  return null;
}

function isoFrom(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
