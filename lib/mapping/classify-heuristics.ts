/**
 * Interbank/interunit transfer and shared-cost detection (spec items 10
 * and 11). Both are keyword heuristics over classification + description
 * — deliberately conservative (a short, explicit list, not a fuzzy
 * classifier) since a false positive here only costs a human a glance at
 * the Exception Center, while a false negative would let an internal
 * transfer get posted as a real expense. Confirmed against the real
 * Buku Bank export: "Mutasi antar unit" is a genuine, recurring
 * classification label (32 occurrences in the August 2026 file) for
 * exactly this case.
 */

const INTERBANK_KEYWORDS = [
  "mutasi antar unit",
  "mutasi antar rekening",
  "mutasi antar bank",
  "transfer antar rekening",
  "transfer antar bank",
  "transfer antar unit",
  "pindah buku",
  "antar rekening",
];

const SHARED_COST_KEYWORDS = [
  "biaya bersama",
  "shared cost",
  "overhead kantor pusat",
  "biaya kantor pusat",
  "corporate overhead",
  "biaya gabungan",
  "semua outlet",
  "seluruh outlet",
];

function haystack(classificationRaw: string | null, descriptionRaw: string | null): string {
  return `${classificationRaw ?? ""} ${descriptionRaw ?? ""}`.trim().toLowerCase();
}

export function isInterbankTransferCandidate(classificationRaw: string | null, descriptionRaw: string | null): boolean {
  const text = haystack(classificationRaw, descriptionRaw);
  if (text === "") return false;
  return INTERBANK_KEYWORDS.some((kw) => text.includes(kw));
}

export function isSharedCostCandidate(classificationRaw: string | null, descriptionRaw: string | null): boolean {
  const text = haystack(classificationRaw, descriptionRaw);
  if (text === "") return false;
  return SHARED_COST_KEYWORDS.some((kw) => text.includes(kw));
}
