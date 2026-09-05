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

  const grid: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  const headerRowIndex = (opts.headerRow ?? 1) - 1;
  const headerRow = grid[headerRowIndex] ?? [];
  const headers = headerRow.map((h) => (h == null ? "" : String(h).trim()));
  const rows = grid.slice(headerRowIndex + 1);

  return { sheetNames: workbook.SheetNames, headers, rows };
}
