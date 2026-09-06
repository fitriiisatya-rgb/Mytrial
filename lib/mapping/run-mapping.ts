import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { mapBankTransaction } from "./engine";
import type { CoaRuleInput, MappableBankRow, OutletRuleInput } from "./types";

export interface MappableSourceRow extends MappableBankRow {
  id: string;
}

export interface MappingRunCounters {
  rowsScanned: number;
  rowsOutletMapped: number;
  rowsCoaMapped: number;
  rowsAmbiguous: number;
  rowsInterbankCandidate: number;
  rowsSharedCostCandidate: number;
  rowsExceptionsCreated: number;
  rowsExceptionsAutoresolved: number;
}

function emptyCounters(): MappingRunCounters {
  return {
    rowsScanned: 0,
    rowsOutletMapped: 0,
    rowsCoaMapped: 0,
    rowsAmbiguous: 0,
    rowsInterbankCandidate: 0,
    rowsSharedCostCandidate: 0,
    rowsExceptionsCreated: 0,
    rowsExceptionsAutoresolved: 0,
  };
}

/**
 * Runs the pure mapping engine (lib/mapping/engine.ts) against a set of
 * already-fetched bank_transactions_raw rows and persists the outcome —
 * shared by both call sites so "what the reprocess engine does" and
 * "what happens right after a fresh import" are the exact same code
 * (same principle as Phase 3's classify-then-write split):
 *
 * - commitBankExpenseImport (app/import/bank-expense/actions.ts) calls
 *   this once, immediately, on the rows it just inserted (trigger =
 *   'post_import' at the call site).
 * - reprocessMapping (app/mapping/actions.ts) calls this on whatever
 *   rows are still open after fetching them fresh from the database,
 *   e.g. after new rules were added (trigger = 'manual').
 *
 * Never touches a row whose exception a human already resolved or
 * ignored — the exceptions table's (source_table, source_id) unique
 * constraint also makes a second exception row for the same source_id
 * impossible, so an existing exception is always updated in place, never
 * duplicated.
 */
export async function runMappingOnRows(
  supabase: SupabaseClient<Database>,
  rows: MappableSourceRow[],
  actorId: string | null
): Promise<MappingRunCounters> {
  const counters = emptyCounters();
  if (rows.length === 0) return counters;

  const [{ data: outletRuleRows }, { data: coaRuleRows }] = await Promise.all([
    supabase.from("outlet_mapping_rules").select("*").eq("active", true),
    supabase.from("coa_mapping_rules").select("*").eq("active", true),
  ]);
  const outletRules = (outletRuleRows ?? []) as OutletRuleInput[];
  const coaRules = (coaRuleRows ?? []) as CoaRuleInput[];

  const rowIds = rows.map((r) => r.id);
  const { data: existingExceptions } = await supabase
    .from("exceptions")
    .select("id, source_id, exception_type, status")
    .eq("source_table", "bank_transactions_raw")
    .in("source_id", rowIds);
  const exceptionByRowId = new Map((existingExceptions ?? []).map((e) => [e.source_id, e]));

  for (const row of rows) {
    counters.rowsScanned++;
    const result = mapBankTransaction({ row, outletRules, coaRules });

    await supabase
      .from("bank_transactions_raw")
      .update({
        detected_outlet_id: result.detectedOutletId,
        detected_coa_id: result.detectedCoaId,
        matched_outlet_rule_id: result.matchedOutletRuleId,
        matched_coa_rule_id: result.matchedCoaRuleId,
        is_interbank_transfer: result.isInterbankTransfer,
        is_shared_cost_candidate: result.isSharedCostCandidate,
        exception_status: result.exceptionType ? "open" : null,
        mapped_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (result.detectedOutletId) counters.rowsOutletMapped++;
    if (result.detectedCoaId) counters.rowsCoaMapped++;
    if (result.exceptionType === "ambiguous_mapping") counters.rowsAmbiguous++;
    if (result.isInterbankTransfer) counters.rowsInterbankCandidate++;
    if (result.isSharedCostCandidate) counters.rowsSharedCostCandidate++;

    const existing = exceptionByRowId.get(row.id);
    if (result.exceptionType) {
      if (!existing) {
        const { error } = await supabase.from("exceptions").insert({
          source_table: "bank_transactions_raw",
          source_id: row.id,
          exception_type: result.exceptionType,
          suggested_outlet_id: result.detectedOutletId,
          suggested_coa_id: result.detectedCoaId,
          status: "open",
          resolved_outlet_id: null,
          resolved_coa_id: null,
          create_rule_on_resolve: false,
          resolution_note: result.exceptionNote,
          resolved_by: null,
          resolved_at: null,
        });
        if (!error) counters.rowsExceptionsCreated++;
      } else if (existing.status === "open" && existing.exception_type !== result.exceptionType) {
        // Diagnosis changed under the (possibly updated) rule set — same
        // open exception row, updated in place. A resolved/ignored
        // exception is a human decision and is never touched here.
        await supabase
          .from("exceptions")
          .update({
            exception_type: result.exceptionType,
            suggested_outlet_id: result.detectedOutletId,
            suggested_coa_id: result.detectedCoaId,
          })
          .eq("id", existing.id);
      }
    } else if (existing && existing.status === "open") {
      // Now resolves cleanly under the current rule set (typically: a
      // reprocess run after a new/learned rule was added) — auto-resolve
      // the exception instead of leaving a stale "open" issue on a row
      // that no longer has one.
      await supabase
        .from("exceptions")
        .update({
          status: "resolved",
          resolved_outlet_id: result.detectedOutletId,
          resolved_coa_id: result.detectedCoaId,
          resolution_note: "Auto-resolved oleh Reprocess Engine — rule baru berhasil memetakan baris ini.",
          resolved_by: actorId,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      counters.rowsExceptionsAutoresolved++;
    }
  }

  return counters;
}

/** Exception types the Mapping Engine itself creates and is therefore
 * allowed to re-evaluate on reprocess. A Phase 3 import-time exception
 * (bank_not_found, invalid_amount, malformed_data, duplicate_suspected)
 * is never touched here — those need a corrected re-import, not a
 * mapping rule. */
export const MAPPING_OWNED_EXCEPTION_TYPES: Database["public"]["Enums"]["exception_type"][] = [
  "outlet_not_detected",
  "coa_not_detected",
  "unknown_classification",
  "ambiguous_mapping",
  "interbank_transfer",
  "shared_cost_candidate",
];
