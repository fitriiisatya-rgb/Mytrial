import type { MappableBankRow } from "./types";

export interface SimilarCandidate {
  id: string;
  confidence: "exact_classification" | "description_keyword";
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** A crude but effective description-similarity check: at least 2 shared
 * words of length >= 4 (skips short connector words like "ke"/"dari"
 * without hand-maintaining an Indonesian stopword list). */
function shareDescriptionKeywords(a: string, b: string): boolean {
  const wordsA = new Set(normalize(a).split(/\s+/).filter((w) => w.length >= 4));
  const wordsB = normalize(b).split(/\s+/).filter((w) => w.length >= 4);
  const shared = wordsB.filter((w) => wordsA.has(w));
  return shared.length >= 2;
}

/**
 * Similar Transaction Suggestion (spec item 7) — feeds Bulk Resolution
 * (spec item 8): when a human resolves one exception, this finds other
 * still-open rows in the same batch/entity that are probably the exact
 * same recurring transaction type, so they can be resolved together
 * instead of one at a time. Same bank + identical classification is
 * "exact_classification" (high confidence — e.g. the real file's 9
 * recurring "Administrasi Bank" Rp 3,500 rows); same bank with
 * significant description-word overlap but a different/blank
 * classification is "description_keyword" (lower confidence, always
 * shown separately so a human can sanity-check it before bulk-applying).
 */
export function findSimilarRows(
  target: MappableBankRow,
  candidates: { id: string; row: MappableBankRow }[]
): SimilarCandidate[] {
  const results: SimilarCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.row.bankId !== target.bankId) continue;
    const targetClass = (target.classificationRaw ?? "").trim();
    const candidateClass = (candidate.row.classificationRaw ?? "").trim();
    if (targetClass !== "" && normalize(targetClass) === normalize(candidateClass)) {
      results.push({ id: candidate.id, confidence: "exact_classification" });
      continue;
    }
    if (
      target.descriptionRaw &&
      candidate.row.descriptionRaw &&
      shareDescriptionKeywords(target.descriptionRaw, candidate.row.descriptionRaw)
    ) {
      results.push({ id: candidate.id, confidence: "description_keyword" });
    }
  }
  return results;
}
