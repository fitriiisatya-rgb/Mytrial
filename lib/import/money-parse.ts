import { toSen, type Sen } from "@/lib/money";

export interface ParsedAmount {
  /** null means "blank" — distinct from 0, which is a real zero-amount row. */
  sen: Sen | null;
  error?: string;
}

/**
 * Import-specific money parsing: source files carry thousand separators
 * and locale-ambiguous punctuation that lib/money.ts's toSen() (which
 * expects an already-clean "1234.56"-style string) deliberately does not
 * handle. This function normalizes the raw cell text down to that clean
 * form, then hands off to toSen() — toSen still does the actual
 * BigInt/sen conversion, so no floating point ever touches the final
 * stored value.
 *
 * Locale detection: if both "," and "." appear, the LAST one is the
 * decimal separator and the other is thousands (covers both
 * "1.234.567,89" and "1,234,567.89"). If only one appears, it is treated
 * as a decimal separator when followed by exactly 1-2 digits at the end
 * of the string, otherwise as a thousands separator — the same
 * heuristic spreadsheets themselves use, applied consistently rather
 * than guessed per row.
 */
export function parseImportAmount(raw: string | number | null | undefined): ParsedAmount {
  if (raw === null || raw === undefined) return { sen: null };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { sen: null, error: `non-finite number ${raw}` };
    try {
      return { sen: toSen(raw) };
    } catch (e) {
      return { sen: null, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const trimmed = raw.trim();
  if (trimmed === "") return { sen: null };

  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith("-");
  let body = trimmed.replace(/^\(|\)$/g, "").replace(/^-/, "").replace(/[^\d.,]/g, "");
  if (body === "") return { sen: null, error: `no digits in "${raw}"` };

  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      body = body.replace(/\./g, "").replace(",", ".");
    } else {
      body = body.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const fractionLen = body.length - lastComma - 1;
    body = fractionLen >= 1 && fractionLen <= 2 ? body.replace(",", ".") : body.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const fractionLen = body.length - lastDot - 1;
    body = fractionLen >= 1 && fractionLen <= 2 ? body : body.replace(/\./g, "");
  }

  try {
    const sen = toSen(body);
    return { sen: negative ? -sen : sen };
  } catch (e) {
    return { sen: null, error: e instanceof Error ? e.message : String(e) };
  }
}
