import { toSen } from "@/lib/money";
import type { CoaRuleInput, MappableBankRow, MatchType, OutletRuleInput, RuleMatch, RulePick } from "./types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** A row's transaction direction, for rules that filter on `direction`
 * ('out' = money leaving via this bank book, i.e. credit>0 per the
 * Kredit>0-is-an-expense-candidate rule from Phase 3; 'in' = debit>0).
 * null when neither side is positive (shouldn't happen for a row that
 * reached the mapping engine, but never guessed at). */
function rowDirection(row: MappableBankRow): "out" | "in" | null {
  if (row.creditSen > 0n) return "out";
  if (row.debitSen > 0n) return "in";
  return null;
}

function matchesText(matchType: MatchType, matchValue: string, haystack: string): boolean {
  const needle = normalize(matchValue);
  const hay = normalize(haystack);
  switch (matchType) {
    case "exact":
      return hay === needle;
    case "keyword":
      return hay.includes(needle);
    case "regex":
      try {
        return new RegExp(matchValue, "i").test(haystack);
      } catch {
        // An invalid regex saved to a rule must never crash the engine or
        // silently match everything — it simply never matches.
        return false;
      }
  }
}

export function matchOutletRule(rule: OutletRuleInput, row: MappableBankRow): boolean {
  if (!rule.active) return false;
  if (rule.bank_id !== null && rule.bank_id !== row.bankId) return false;
  if (rule.unit_value !== null && normalize(rule.unit_value) !== normalize(row.unitRaw ?? "")) return false;
  if (rule.classification !== null && normalize(rule.classification) !== normalize(row.classificationRaw ?? "")) return false;
  if (rule.direction !== null && rule.direction !== rowDirection(row)) return false;
  if (rule.match_value !== null && !matchesText(rule.match_type, rule.match_value, row.descriptionRaw ?? "")) return false;
  return true;
}

/** Count of non-null discriminating fields — the tiebreaker when two
 * active rules share the same `priority`: the more specific rule (more
 * fields pinned down) wins over a broader/wildcard one. */
export function outletRuleSpecificity(rule: OutletRuleInput): number {
  return [rule.bank_id, rule.unit_value, rule.classification, rule.direction, rule.match_value].filter((v) => v !== null).length;
}

export function matchCoaRule(rule: CoaRuleInput, row: MappableBankRow): boolean {
  if (!rule.active) return false;
  if (rule.bank_id !== null && rule.bank_id !== row.bankId) return false;
  if (rule.outlet_id !== null && rule.outlet_id !== row.detectedOutletId) return false;
  if (rule.unit_value !== null && normalize(rule.unit_value) !== normalize(row.unitRaw ?? "")) return false;
  if (rule.classification !== null && normalize(rule.classification) !== normalize(row.classificationRaw ?? "")) return false;
  if (rule.direction !== null && rule.direction !== rowDirection(row)) return false;
  if (rule.description_keyword !== null && !normalize(row.descriptionRaw ?? "").includes(normalize(rule.description_keyword))) return false;
  if (rule.amount_min !== null && row.creditSen < toSen(rule.amount_min)) return false;
  if (rule.amount_max !== null && row.creditSen > toSen(rule.amount_max)) return false;
  return true;
}

export function coaRuleSpecificity(rule: CoaRuleInput): number {
  return [
    rule.bank_id,
    rule.outlet_id,
    rule.unit_value,
    rule.classification,
    rule.description_keyword,
    rule.direction,
    rule.amount_min,
    rule.amount_max,
  ].filter((v) => v !== null).length;
}

/**
 * Rule priority + specificity resolution (spec item 3): lower `priority`
 * number wins first; a tie on `priority` is broken by specificity (more
 * discriminating fields wins); a tie on BOTH is never silently resolved
 * by array order — it is reported as ambiguous (spec item 4) so a human
 * decides, rather than the engine picking whichever rule happened to be
 * created first.
 */
export function pickBestRule<TRule extends { priority: number }>(matches: RuleMatch<TRule>[]): RulePick<TRule> {
  if (matches.length === 0) return { winner: null, ambiguous: false, candidates: [] };

  const sorted = [...matches].sort((a, b) => a.rule.priority - b.rule.priority || b.specificity - a.specificity);
  const top = sorted[0]!;
  const tied = sorted.filter((m) => m.rule.priority === top.rule.priority && m.specificity === top.specificity);

  if (tied.length > 1) {
    return { winner: null, ambiguous: true, candidates: tied.map((t) => t.rule) };
  }
  return { winner: top.rule, ambiguous: false, candidates: [top.rule] };
}

export function pickBestOutletRule(rules: OutletRuleInput[], row: MappableBankRow): RulePick<OutletRuleInput> {
  const matches = rules.filter((r) => matchOutletRule(r, row)).map((rule) => ({ rule, specificity: outletRuleSpecificity(rule) }));
  return pickBestRule(matches);
}

export function pickBestCoaRule(rules: CoaRuleInput[], row: MappableBankRow): RulePick<CoaRuleInput> {
  const matches = rules.filter((r) => matchCoaRule(r, row)).map((rule) => ({ rule, specificity: coaRuleSpecificity(rule) }));
  return pickBestRule(matches);
}
