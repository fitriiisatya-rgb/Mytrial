/** The subset of a bank_transactions_raw row the mapping engine needs to
 * evaluate rules against — deliberately narrower than the full DB row so
 * this stays trivially testable with plain object literals. */
export interface MappableBankRow {
  bankId: string | null;
  unitRaw: string | null;
  classificationRaw: string | null;
  descriptionRaw: string | null;
  debitSen: bigint;
  creditSen: bigint;
  /** Set only once outlet mapping has already run — coa_mapping_rules.outlet_id
   * filters against this, so COA mapping must run after outlet mapping. */
  detectedOutletId: string | null;
}

export type MatchType = "exact" | "keyword" | "regex";

export interface OutletRuleInput {
  id: string;
  bank_id: string | null;
  unit_value: string | null;
  classification: string | null;
  match_type: MatchType;
  match_value: string | null;
  direction: string | null;
  output_outlet_id: string;
  priority: number;
  active: boolean;
}

export interface CoaRuleInput {
  id: string;
  bank_id: string | null;
  outlet_id: string | null;
  unit_value: string | null;
  classification: string | null;
  description_keyword: string | null;
  direction: string | null;
  amount_min: string | null;
  amount_max: string | null;
  result_coa_id: string;
  bank_coa_override_id: string | null;
  no_outlet_needed: boolean;
  priority: number;
  active: boolean;
}

export interface RuleMatch<TRule> {
  rule: TRule;
  specificity: number;
}

export interface RulePick<TRule> {
  winner: TRule | null;
  ambiguous: boolean;
  /** All rules tied for the top (priority, specificity) rank — length 1
   * when winner is set, length 0 when nothing matched at all, length 2+
   * only when ambiguous is true. */
  candidates: TRule[];
}
