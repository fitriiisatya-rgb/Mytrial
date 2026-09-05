/**
 * Mapping layer between the raw Google Sheet header row and the fields the
 * app actually needs. The spreadsheet is the source, but its header names
 * are not a contract — this module is the only place that knows what a
 * "Bank" or "Debit" column might be called. Add an alias here, never a
 * hardcoded column index in the sync service.
 */

export type MappedField = "bank" | "date" | "unit" | "classification" | "description" | "debit" | "kredit" | "saldo";

const ALIASES: Record<MappedField, string[]> = {
  bank: ["bank", "rekening", "bankrekening", "namabank", "akun", "account", "bankaccount"],
  date: ["tanggal", "tgl", "date", "tanggaltransaksi", "tgltransaksi"],
  unit: ["unit", "outlet", "cabang", "lokasi"],
  classification: ["klasifikasi", "kategori", "classification", "jenis", "jenistransaksi"],
  description: ["deskripsi", "keterangan", "description", "uraian", "catatan", "note", "notes"],
  debit: ["debit", "debet", "dr", "keluar", "uangkeluar"],
  kredit: ["kredit", "credit", "cr", "masuk", "uangmasuk"],
  saldo: ["saldo", "balance", "sisasaldo", "runningbalance"],
};

/** Lowercase, strip everything but letters/digits, so "Bank / Rekening" and "bank_rekening" both normalize the same. */
function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

export interface ColumnMap {
  /** field -> zero-based column index in the sheet, or -1 if not found */
  index: Record<MappedField, number>;
}

/** Build the field -> column index map from a raw header row. Unmatched fields resolve to -1 and must be handled by the caller (not silently ignored). */
export function resolveColumnMap(headerRow: string[]): ColumnMap {
  const normalized = headerRow.map((h) => normalizeHeader(h ?? ""));
  const index = {} as Record<MappedField, number>;

  for (const field of Object.keys(ALIASES) as MappedField[]) {
    const aliases = ALIASES[field];
    const foundAt = normalized.findIndex((h) => aliases.includes(h));
    index[field] = foundAt;
  }

  return { index };
}

export function getCell(row: string[], map: ColumnMap, field: MappedField): string | undefined {
  const idx = map.index[field];
  if (idx < 0 || idx >= row.length) return undefined;
  const value = row[idx];
  return value === undefined || value === "" ? undefined : value;
}
