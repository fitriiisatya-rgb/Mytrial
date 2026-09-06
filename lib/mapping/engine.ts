import type { ExceptionType } from "@/types/database.types";
import { isInterbankTransferCandidate, isSharedCostCandidate } from "./classify-heuristics";
import { pickBestCoaRule, pickBestOutletRule } from "./rule-match";
import type { CoaRuleInput, MappableBankRow, OutletRuleInput } from "./types";

export interface MappingResult {
  detectedOutletId: string | null;
  matchedOutletRuleId: string | null;
  outletAmbiguousRuleIds: string[];
  detectedCoaId: string | null;
  matchedCoaRuleId: string | null;
  coaAmbiguousRuleIds: string[];
  isInterbankTransfer: boolean;
  isSharedCostCandidate: boolean;
  /** null = fully resolved, no human review needed. */
  exceptionType: ExceptionType | null;
  exceptionNote: string | null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** A classification is "known" if some active-or-inactive rule was ever
 * configured to key off it — used to tell "we've genuinely never seen
 * this classification before" (unknown_classification, actionable: add
 * a rule) apart from "this classification is known, but no rule fired
 * for this specific row" (coa_not_detected: wrong bank/amount/outlet
 * combination, not a brand-new category). */
function isKnownClassification(classificationRaw: string | null, outletRules: OutletRuleInput[], coaRules: CoaRuleInput[]): boolean {
  if (!classificationRaw) return true;
  const norm = normalize(classificationRaw);
  return (
    coaRules.some((r) => r.classification !== null && normalize(r.classification) === norm) ||
    outletRules.some((r) => r.classification !== null && normalize(r.classification) === norm)
  );
}

/**
 * Pure orchestration — no I/O, no randomness, deterministic given the
 * same row + rule set. Called both by the real Reprocess Engine (against
 * live rules from the database) and directly by unit tests / the Rule
 * Tester UI (against a hypothetical row) — "what you test is what runs"
 * (same principle Phase 3's classifyBankRows/classifyRevenueRows used).
 */
export function mapBankTransaction(params: {
  row: MappableBankRow;
  outletRules: OutletRuleInput[];
  coaRules: CoaRuleInput[];
}): MappingResult {
  const { row, outletRules, coaRules } = params;

  // A genuine internal transfer is never also a "shared cost" — if a
  // row's text somehow matches both keyword lists, transfer wins: it
  // isn't an expense at all, so allocating it as one would be worse than
  // mis-flagging a shared cost as a plain transfer.
  const interbank = isInterbankTransferCandidate(row.classificationRaw, row.descriptionRaw);
  const sharedCost = !interbank && isSharedCostCandidate(row.classificationRaw, row.descriptionRaw);

  const outletPick = pickBestOutletRule(outletRules, row);
  const detectedOutletId = outletPick.winner?.output_outlet_id ?? null;

  // COA rules can filter on outlet_id (0004: "null = any outlet"), so
  // they must see the outlet this row just resolved to.
  const coaPick = pickBestCoaRule(coaRules, { ...row, detectedOutletId });
  const detectedCoaId = coaPick.winner?.result_coa_id ?? null;

  let exceptionType: ExceptionType | null = null;
  let exceptionNote: string | null = null;

  if (interbank) {
    exceptionType = "interbank_transfer";
    exceptionNote =
      "Klasifikasi/deskripsi menunjukkan mutasi/transfer antar rekening sendiri — bukan pengeluaran riil, perlu konfirmasi sebelum diproses sebagai jurnal transfer.";
  } else if (sharedCost) {
    exceptionType = "shared_cost_candidate";
    exceptionNote = "Klasifikasi/deskripsi menunjukkan biaya bersama lintas outlet — perlu dialokasikan, bukan diposting ke satu outlet.";
  } else if (outletPick.ambiguous) {
    exceptionType = "ambiguous_mapping";
    exceptionNote = `${outletPick.candidates.length} rule outlet cocok dengan priority & specificity yang sama — tidak bisa dipilih otomatis.`;
  } else if (coaPick.ambiguous) {
    exceptionType = "ambiguous_mapping";
    exceptionNote = `${coaPick.candidates.length} rule COA cocok dengan priority & specificity yang sama — tidak bisa dipilih otomatis.`;
  } else {
    const outletNeeded = !(coaPick.winner?.no_outlet_needed ?? false);
    if (detectedOutletId === null && outletNeeded) {
      exceptionType = "outlet_not_detected";
      exceptionNote = `Tidak ada rule outlet yang cocok (Unit="${row.unitRaw ?? ""}", Klasifikasi="${row.classificationRaw ?? ""}").`;
    } else if (detectedCoaId === null) {
      exceptionType = isKnownClassification(row.classificationRaw, outletRules, coaRules) ? "coa_not_detected" : "unknown_classification";
      exceptionNote =
        exceptionType === "unknown_classification"
          ? `Klasifikasi "${row.classificationRaw ?? ""}" belum pernah dikonfigurasi pada rule manapun.`
          : `Tidak ada rule COA yang cocok (Klasifikasi="${row.classificationRaw ?? ""}").`;
    }
  }

  return {
    detectedOutletId,
    matchedOutletRuleId: outletPick.winner?.id ?? null,
    outletAmbiguousRuleIds: outletPick.ambiguous ? outletPick.candidates.map((r) => r.id) : [],
    detectedCoaId,
    matchedCoaRuleId: coaPick.winner?.id ?? null,
    coaAmbiguousRuleIds: coaPick.ambiguous ? coaPick.candidates.map((r) => r.id) : [],
    isInterbankTransfer: interbank,
    isSharedCostCandidate: sharedCost,
    exceptionType,
    exceptionNote,
  };
}
