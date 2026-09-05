import * as XLSX from "xlsx";

export interface ParsedSpreadsheet {
  sheetNames: string[];
  headers: string[];
  /** Each row aligned to `headers` by column index, already past the header row. */
  rows: (string | number | null)[][];
}

/**
 * One parser for CSV and Excel alike (xlsx reads both). Formula
 * evaluation and cell styling are irrelevant here — only cell values are
 * read, and `cellFormula: false` keeps xlsx from evaluating anything in
 * the uploaded file.
 */
export function parseSpreadsheet(
  data: Buffer,
  opts: { isCsv: boolean; sheetName?: string; headerRow?: number }
): ParsedSpreadsheet {
  const workbook = XLSX.read(data, {
    type: "buffer",
    raw: true,
    cellDates: false,
    cellFormula: false,
    ...(opts.isCsv ? { FS: "," } : {}),
  });

  if (workbook.SheetNames.length === 0) {
    throw new Error("File tidak berisi sheet apa pun.");
  }
  const sheetName = opts.sheetName ?? workbook.SheetNames[0]!;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" tidak ditemukan. Sheet tersedia: ${workbook.SheetNames.join(", ")}`);
  }

  // blankrows must stay true (the default) here: dropping blank rows
  // before slicing would silently renumber every row after them, so a
  // user-specified `headerRow` (counted from what they see in their own
  // spreadsheet, e.g. "row 6") would grab the wrong physical row on any
  // file with blank/title rows above the header — as this importer's
  // own real Buku Bank export does (rows 1-5 are a title block).
  const grid: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const headerRowIndex = (opts.headerRow ?? 1) - 1;
  const headerRow = grid[headerRowIndex] ?? [];
  const headers = headerRow.map((h) => (h == null ? "" : String(h).trim()));
  // A fully blank row (every cell null/empty) is spreadsheet padding —
  // e.g. a Saldo formula column copied down far past the last real
  // entry — never a transaction worth flagging as an error; it is
  // dropped here, after the header slice, so it never renumbers
  // anything and never inflates error counts.
  const rows = grid.slice(headerRowIndex + 1).filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""));

  return { sheetNames: workbook.SheetNames, headers, rows };
}
