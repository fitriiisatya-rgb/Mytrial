export interface ColumnMappingSpec {
  field: string;
  label: string;
  required: boolean;
  /** Header names recognized automatically, case-insensitive. */
  defaultHeaders: string[];
}

// Spec section L's exact default mapping for the real Buku Bank source,
// plus a couple of common English/alternate spellings so a lightly
// different export still auto-maps without the user typing anything.
export const BANK_EXPENSE_MAPPING: ColumnMappingSpec[] = [
  { field: "bank", label: "Bank", required: true, defaultHeaders: ["bank", "nama bank"] },
  { field: "date", label: "Tanggal", required: true, defaultHeaders: ["tanggal", "date", "tgl"] },
  { field: "unit", label: "Unit", required: false, defaultHeaders: ["unit"] },
  { field: "classification", label: "Klasifikasi", required: false, defaultHeaders: ["klasifikasi", "classification"] },
  { field: "description", label: "Deskripsi", required: false, defaultHeaders: ["deskripsi", "description", "keterangan"] },
  { field: "debit", label: "Debit", required: true, defaultHeaders: ["debit"] },
  { field: "credit", label: "Kredit", required: true, defaultHeaders: ["kredit", "credit"] },
  { field: "balance", label: "Saldo", required: false, defaultHeaders: ["saldo", "balance"] },
  { field: "externalRef", label: "No. Referensi", required: false, defaultHeaders: ["referensi", "reference", "ref", "no referensi"] },
];

export const REVENUE_MAPPING: ColumnMappingSpec[] = [
  { field: "date", label: "Date", required: true, defaultHeaders: ["date", "tanggal"] },
  { field: "outlet", label: "Outlet", required: true, defaultHeaders: ["outlet"] },
  { field: "description", label: "Description", required: false, defaultHeaders: ["description", "deskripsi", "keterangan"] },
  { field: "revenueCategory", label: "Revenue Category", required: false, defaultHeaders: ["revenue category", "category", "kategori"] },
  { field: "amount", label: "Amount", required: true, defaultHeaders: ["amount", "jumlah", "nominal"] },
  { field: "externalRef", label: "External Reference", required: false, defaultHeaders: ["external reference", "reference", "ref"] },
];

export interface ResolvedMapping {
  /** field -> index into the parsed header row, or -1 if unmapped. */
  indices: Record<string, number>;
  missingRequired: string[];
}

/**
 * Matches source headers to target fields — first any user-typed
 * override (spec L: "Jika header berbeda: allow user mapping sebelum
 * import"), then the spec's documented defaults, case-insensitively.
 * Never guesses a match beyond exact (trimmed, case-insensitive) header
 * text — an unmatched required field is reported, not silently skipped.
 */
export function resolveColumnMapping(
  headers: string[],
  spec: ColumnMappingSpec[],
  overrides: Record<string, string | null>
): ResolvedMapping {
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());
  const indices: Record<string, number> = {};
  const missingRequired: string[] = [];

  for (const col of spec) {
    const override = overrides[col.field]?.trim().toLowerCase();
    let idx = -1;
    if (override) {
      idx = normalizedHeaders.indexOf(override);
    } else {
      for (const candidate of col.defaultHeaders) {
        idx = normalizedHeaders.indexOf(candidate);
        if (idx !== -1) break;
      }
    }
    indices[col.field] = idx;
    if (idx === -1 && col.required) missingRequired.push(col.label);
  }

  return { indices, missingRequired };
}

export function cellAt(row: (string | number | null)[], index: number): string | number | null {
  if (index < 0) return null;
  return row[index] ?? null;
}
