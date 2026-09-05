export interface ParsedDate {
  /** ISO 'YYYY-MM-DD', ready for a PostgreSQL DATE column. */
  date: string | null;
  error?: string;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

/**
 * Deliberately supports only explicit, unambiguous formats — never tries
 * several interpretations and picks whichever parses ("silent
 * guessing"). Slash/dash numeric dates (05/03/2026) are always read as
 * DD/MM/YYYY, a single fixed, documented convention for this Indonesian
 * bank-book source — not a per-row guess — so a UI column-mapping step
 * must say so up front rather than leaving it implicit.
 */
export function parseImportDate(raw: string | number | null | undefined): ParsedDate {
  if (raw === null || raw === undefined) return { date: null, error: "blank date" };

  if (typeof raw === "number") {
    // Excel serial date (days since the 1899-12-30 epoch Excel uses).
    if (!Number.isFinite(raw) || raw <= 0) return { date: null, error: `invalid Excel serial date ${raw}` };
    const ms = Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000;
    const d = new Date(ms);
    return { date: d.toISOString().slice(0, 10) };
  }

  const trimmed = raw.trim();
  if (trimmed === "") return { date: null, error: "blank date" };

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (m) return fromParts(Number(m[1]), Number(m[2]), Number(m[3]), raw);

  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (m) return fromParts(Number(m[3]), Number(m[2]), Number(m[1]), raw);

  m = /^(\d{1,2})[\s-]([a-zA-Z]{3,})[\s-](\d{4})$/.exec(trimmed);
  if (m) {
    const monthName = m[2]!;
    const month = MONTH_NAMES[monthName.toLowerCase().slice(0, 3)];
    if (!month) return { date: null, error: `unrecognized month name "${monthName}" in "${raw}"` };
    return fromParts(Number(m[3]), month, Number(m[1]), raw);
  }

  return {
    date: null,
    error: `unrecognized date format "${raw}" — expected DD/MM/YYYY, YYYY-MM-DD, or "D Mon YYYY"`,
  };
}

function fromParts(year: number, month: number, day: number, raw: string | number): ParsedDate {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { date: null, error: `invalid date parts in "${raw}"` };
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return { date: null, error: `"${raw}" is not a real calendar date` };
  }
  return { date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}
