import type { MappableBankRow } from "./types";

/** A freshly-learned rule is scoped as tightly as the source row allows
 * (bank + unit + classification, whichever are actually present) and
 * given a low priority number so it outranks any broader/wildcard rule
 * without a human having to think about numbering — narrower rules
 * naturally deserve to win ties via specificity anyway (rule-match.ts),
 * this priority just guarantees it even against another already-narrow
 * rule created earlier at the default priority. */
const LEARNED_RULE_PRIORITY = 10;

export interface LearnedOutletRuleInput {
  bank_id: string | null;
  unit_value: string | null;
  classification: string | null;
  match_type: "exact";
  match_value: null;
  direction: null;
  output_outlet_id: string;
  priority: number;
  active: true;
  created_by: string;
}

export interface LearnedCoaRuleInput {
  bank_id: string | null;
  outlet_id: string | null;
  unit_value: string | null;
  classification: string | null;
  description_keyword: null;
  direction: null;
  amount_min: null;
  amount_max: null;
  source_type: null;
  result_coa_id: string;
  bank_coa_override_id: null;
  no_outlet_needed: boolean;
  priority: number;
  active: true;
  created_by: string;
}

/**
 * Learning Mapping (spec item 6): when an exception is resolved with
 * "create rule on resolve" checked, build the rule that would have
 * auto-resolved this exact row — so the next occurrence of the same
 * bank/unit/classification combination never becomes an exception
 * again. Deliberately keyed on classification only (never on
 * description, which is usually unique per transaction and would never
 * match anything again) — matches how the human actually generalized
 * their decision ("every Administrasi Bank row on this account", not
 * "this one specific Aug 1st fee").
 */
export function buildLearnedOutletRule(params: {
  row: Pick<MappableBankRow, "bankId" | "unitRaw" | "classificationRaw">;
  outputOutletId: string;
  createdBy: string;
}): LearnedOutletRuleInput {
  return {
    bank_id: params.row.bankId,
    unit_value: params.row.unitRaw?.trim() || null,
    classification: params.row.classificationRaw?.trim() || null,
    match_type: "exact",
    match_value: null,
    direction: null,
    output_outlet_id: params.outputOutletId,
    priority: LEARNED_RULE_PRIORITY,
    active: true,
    created_by: params.createdBy,
  };
}

export function buildLearnedCoaRule(params: {
  row: Pick<MappableBankRow, "bankId" | "unitRaw" | "classificationRaw">;
  detectedOutletId: string | null;
  resultCoaId: string;
  createdBy: string;
}): LearnedCoaRuleInput {
  return {
    bank_id: params.row.bankId,
    outlet_id: params.detectedOutletId,
    unit_value: params.row.unitRaw?.trim() || null,
    classification: params.row.classificationRaw?.trim() || null,
    description_keyword: null,
    direction: null,
    amount_min: null,
    amount_max: null,
    source_type: null,
    result_coa_id: params.resultCoaId,
    bank_coa_override_id: null,
    no_outlet_needed: params.detectedOutletId === null,
    priority: LEARNED_RULE_PRIORITY,
    active: true,
    created_by: params.createdBy,
  };
}
