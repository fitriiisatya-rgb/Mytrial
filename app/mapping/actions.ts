"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";
import { toSen } from "@/lib/money";
import { mapBankTransaction, type MappingResult } from "@/lib/mapping/engine";
import { buildLearnedCoaRule, buildLearnedOutletRule } from "@/lib/mapping/learn";
import { MAPPING_OWNED_EXCEPTION_TYPES, runMappingOnRows, type MappableSourceRow } from "@/lib/mapping/run-mapping";
import type { CoaRuleInput, MappableBankRow, OutletRuleInput } from "@/lib/mapping/types";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const RULES_BASE = "/mapping/rules";
const EXCEPTIONS_BASE = "/mapping/exceptions";
const DASHBOARD_BASE = "/mapping";

function fail(base: string, message: string): never {
  redirect(`${base}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

async function requireUser(supabase: SupabaseClient<Database>, base: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail(base, "Sesi berakhir, silakan login kembali.");
  return user;
}

// =====================================================================
// RULE CRUD (spec items 1-3: Outlet Mapping, COA Mapping, priority +
// specificity — the actual matching/ranking logic lives in
// lib/mapping/rule-match.ts and is identical whether it runs here for
// real or against a hypothetical row in the Rule Tester below). Rules
// are never hard-deleted, only deactivated — same convention as every
// Master Data module.
// =====================================================================

export async function saveOutletRule(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, RULES_BASE);

  const id = formData.get("id") as string | null;
  const row = {
    bank_id: str(formData, "bank_id"),
    unit_value: str(formData, "unit_value"),
    classification: str(formData, "classification"),
    match_type: (formData.get("match_type") as Database["public"]["Enums"]["match_type"]) || "keyword",
    match_value: str(formData, "match_value"),
    direction: str(formData, "direction"),
    output_outlet_id: formData.get("output_outlet_id") as string,
    priority: Number(formData.get("priority") ?? 100),
    active: formData.get("active") === "on",
    created_by: user.id,
  };
  if (!row.output_outlet_id) fail(RULES_BASE, "Outlet tujuan wajib dipilih.");

  const { error } = id
    ? await supabase.from("outlet_mapping_rules").update(row).eq("id", id)
    : await supabase.from("outlet_mapping_rules").insert(row);
  if (error) fail(RULES_BASE, error.message);

  await logAudit(supabase, {
    userId: user.id,
    action: id ? "outlet_rule_updated" : "outlet_rule_created",
    entityTable: "outlet_mapping_rules",
    entityId: id ?? row.output_outlet_id,
    newValue: row,
  });

  revalidatePath(RULES_BASE);
  redirect(RULES_BASE);
}

export async function toggleOutletRuleActive(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, RULES_BASE);
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const { error } = await supabase.from("outlet_mapping_rules").update({ active: !active }).eq("id", id);
  if (error) fail(RULES_BASE, error.message);
  await logAudit(supabase, { userId: user.id, action: active ? "outlet_rule_deactivated" : "outlet_rule_activated", entityTable: "outlet_mapping_rules", entityId: id });
  revalidatePath(RULES_BASE);
  redirect(RULES_BASE);
}

export async function saveCoaRule(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, RULES_BASE);

  const id = formData.get("id") as string | null;
  const row = {
    bank_id: str(formData, "bank_id"),
    outlet_id: str(formData, "outlet_id"),
    unit_value: str(formData, "unit_value"),
    classification: str(formData, "classification"),
    description_keyword: str(formData, "description_keyword"),
    direction: str(formData, "direction"),
    amount_min: str(formData, "amount_min"),
    amount_max: str(formData, "amount_max"),
    source_type: str(formData, "source_type") as Database["public"]["Enums"]["journal_source_type"] | null,
    result_coa_id: formData.get("result_coa_id") as string,
    bank_coa_override_id: str(formData, "bank_coa_override_id"),
    no_outlet_needed: formData.get("no_outlet_needed") === "on",
    priority: Number(formData.get("priority") ?? 100),
    active: formData.get("active") === "on",
    created_by: user.id,
  };
  if (!row.result_coa_id) fail(RULES_BASE, "COA hasil wajib dipilih.");

  const { error } = id
    ? await supabase.from("coa_mapping_rules").update(row).eq("id", id)
    : await supabase.from("coa_mapping_rules").insert(row);
  if (error) fail(RULES_BASE, error.message);

  await logAudit(supabase, {
    userId: user.id,
    action: id ? "coa_rule_updated" : "coa_rule_created",
    entityTable: "coa_mapping_rules",
    entityId: id ?? row.result_coa_id,
    newValue: row,
  });

  revalidatePath(RULES_BASE);
  redirect(RULES_BASE);
}

export async function toggleCoaRuleActive(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, RULES_BASE);
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const { error } = await supabase.from("coa_mapping_rules").update({ active: !active }).eq("id", id);
  if (error) fail(RULES_BASE, error.message);
  await logAudit(supabase, { userId: user.id, action: active ? "coa_rule_deactivated" : "coa_rule_activated", entityTable: "coa_mapping_rules", entityId: id });
  revalidatePath(RULES_BASE);
  redirect(RULES_BASE);
}

// =====================================================================
// RULE TESTER (spec item 12) — pure, read-only, no DB write. Runs the
// exact same mapBankTransaction() the real engine uses (lib/mapping/
// engine.ts), against every currently-active rule, so "what the tester
// says" and "what the engine would actually do" can never drift apart.
// =====================================================================

export interface RuleTesterResult extends MappingResult {}

export async function testMappingRule(formData: FormData): Promise<RuleTesterResult> {
  const supabase = await createClient();
  const [{ data: outletRuleRows }, { data: coaRuleRows }] = await Promise.all([
    supabase.from("outlet_mapping_rules").select("*").eq("active", true),
    supabase.from("coa_mapping_rules").select("*").eq("active", true),
  ]);

  const bankId = str(formData, "bank_id");
  const row: MappableBankRow = {
    bankId,
    unitRaw: str(formData, "unit_raw"),
    classificationRaw: str(formData, "classification_raw"),
    descriptionRaw: str(formData, "description_raw"),
    debitSen: toSen(str(formData, "debit") ?? "0"),
    creditSen: toSen(str(formData, "credit") ?? "0"),
    detectedOutletId: null,
  };

  return mapBankTransaction({
    row,
    outletRules: (outletRuleRows ?? []) as OutletRuleInput[],
    coaRules: (coaRuleRows ?? []) as CoaRuleInput[],
  });
}

// =====================================================================
// REPROCESS ENGINE (spec item 9) — re-runs the mapping engine against
// whatever bank_transactions_raw rows are still open, either for one
// import batch or for every batch belonging to one entity. Never
// touches a row a human already resolved or ignored (runMappingOnRows'
// own guarantee), so clicking Reprocess after adding a rule is always
// safe to repeat.
// =====================================================================

export async function reprocessMapping(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, DASHBOARD_BASE);

  const scope = formData.get("scope") as "batch" | "entity";
  const scopeId = formData.get("scope_id") as string;
  if (!scope || !scopeId) fail(DASHBOARD_BASE, "Pilih batch atau entitas untuk diproses ulang.");

  let bankTxnQuery = supabase
    .from("bank_transactions_raw")
    .select("id, bank_id, unit_raw, classification_raw, description_raw, debit, credit, mapped_at, exception_status")
    .gt("credit", 0)
    .not("bank_id", "is", null);

  if (scope === "batch") {
    bankTxnQuery = bankTxnQuery.eq("import_batch_id", scopeId);
  } else {
    const { data: banks } = await supabase.from("banks").select("id").eq("entity_id", scopeId);
    const bankIds = (banks ?? []).map((b) => b.id);
    if (bankIds.length === 0) fail(DASHBOARD_BASE, "Entitas ini belum memiliki rekening bank.");
    bankTxnQuery = bankTxnQuery.in("bank_id", bankIds);
  }

  const { data: candidateRows, error: fetchError } = await bankTxnQuery;
  if (fetchError) fail(DASHBOARD_BASE, fetchError.message);

  const ids = (candidateRows ?? []).map((r) => r.id);
  const { data: existingExceptions } = ids.length
    ? await supabase.from("exceptions").select("source_id, exception_type, status").eq("source_table", "bank_transactions_raw").in("source_id", ids)
    : { data: [] };
  const exceptionByRowId = new Map((existingExceptions ?? []).map((e) => [e.source_id, e]));

  // Only ever re-attempt a row that either has never been mapped at all,
  // or whose open exception is one the Mapping Engine itself owns
  // (never a Phase 3 import-time issue, and never one a human already
  // resolved/ignored).
  const eligible: MappableSourceRow[] = (candidateRows ?? [])
    .filter((r) => {
      if (r.mapped_at === null) return true;
      const existing = exceptionByRowId.get(r.id);
      return !!existing && existing.status === "open" && MAPPING_OWNED_EXCEPTION_TYPES.includes(existing.exception_type);
    })
    .map((r) => ({
      id: r.id,
      bankId: r.bank_id,
      unitRaw: r.unit_raw,
      classificationRaw: r.classification_raw,
      descriptionRaw: r.description_raw,
      debitSen: toSen(r.debit),
      creditSen: toSen(r.credit),
      detectedOutletId: null,
    }));

  const startedAt = new Date().toISOString();
  const counters = await runMappingOnRows(supabase, eligible, user.id);

  await supabase.from("mapping_runs").insert({
    scope,
    scope_id: scopeId,
    triggered_by: user.id,
    trigger: "manual",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    rows_scanned: counters.rowsScanned,
    rows_outlet_mapped: counters.rowsOutletMapped,
    rows_coa_mapped: counters.rowsCoaMapped,
    rows_ambiguous: counters.rowsAmbiguous,
    rows_interbank_candidate: counters.rowsInterbankCandidate,
    rows_shared_cost_candidate: counters.rowsSharedCostCandidate,
    rows_exceptions_created: counters.rowsExceptionsCreated,
    rows_exceptions_autoresolved: counters.rowsExceptionsAutoresolved,
  });

  await logAudit(supabase, {
    userId: user.id,
    action: "mapping_reprocessed",
    entityTable: "mapping_runs",
    entityId: scopeId,
    newValue: { scope, ...counters },
  });

  revalidatePath(DASHBOARD_BASE);
  revalidatePath(EXCEPTIONS_BASE);
  redirect(`${DASHBOARD_BASE}?reprocessed=${counters.rowsScanned}`);
}

// =====================================================================
// EXCEPTION CENTER — resolve / bulk resolve / ignore (spec items 5, 6,
// 8). Resolving always writes the human's decision back onto the source
// bank_transactions_raw row (never leaves it out of sync with the now-
// resolved exception) and, if requested, teaches the engine a new rule
// via lib/mapping/learn.ts so the same combination never becomes an
// exception again (Learning Mapping, spec item 6).
// =====================================================================

interface ExceptionRowContext {
  id: string;
  source_id: string;
  exception_type: Database["public"]["Enums"]["exception_type"];
}

async function fetchSourceRow(supabase: SupabaseClient<Database>, sourceId: string) {
  const { data } = await supabase
    .from("bank_transactions_raw")
    .select("id, bank_id, unit_raw, classification_raw, description_raw")
    .eq("id", sourceId)
    .single();
  return data;
}

async function resolveOne(
  supabase: SupabaseClient<Database>,
  exception: ExceptionRowContext,
  params: { resolvedOutletId: string | null; resolvedCoaId: string | null; resolutionNote: string | null; createRuleOnResolve: boolean; userId: string }
) {
  const sourceRow = await fetchSourceRow(supabase, exception.source_id);
  if (!sourceRow) return;

  await supabase
    .from("exceptions")
    .update({
      status: "resolved",
      resolved_outlet_id: params.resolvedOutletId,
      resolved_coa_id: params.resolvedCoaId,
      resolution_note: params.resolutionNote,
      create_rule_on_resolve: params.createRuleOnResolve,
      resolved_by: params.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", exception.id);

  await supabase
    .from("bank_transactions_raw")
    .update({
      detected_outlet_id: params.resolvedOutletId,
      detected_coa_id: params.resolvedCoaId,
      exception_status: null,
      is_interbank_transfer: exception.exception_type === "interbank_transfer" ? true : undefined,
    })
    .eq("id", exception.source_id);

  if (params.createRuleOnResolve) {
    if (params.resolvedOutletId) {
      const learned = buildLearnedOutletRule({
        row: { bankId: sourceRow.bank_id, unitRaw: sourceRow.unit_raw, classificationRaw: sourceRow.classification_raw },
        outputOutletId: params.resolvedOutletId,
        createdBy: params.userId,
      });
      await supabase.from("outlet_mapping_rules").insert(learned);
    }
    if (params.resolvedCoaId) {
      const learned = buildLearnedCoaRule({
        row: { bankId: sourceRow.bank_id, unitRaw: sourceRow.unit_raw, classificationRaw: sourceRow.classification_raw },
        detectedOutletId: params.resolvedOutletId,
        resultCoaId: params.resolvedCoaId,
        createdBy: params.userId,
      });
      await supabase.from("coa_mapping_rules").insert(learned);
    }
  }

  await logAudit(supabase, {
    userId: params.userId,
    action: "exception_resolved",
    entityTable: "exceptions",
    entityId: exception.id,
    newValue: { resolvedOutletId: params.resolvedOutletId, resolvedCoaId: params.resolvedCoaId, createRuleOnResolve: params.createRuleOnResolve },
  });
}

export async function resolveException(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, EXCEPTIONS_BASE);

  const id = formData.get("id") as string;
  const { data: exception } = await supabase.from("exceptions").select("id, source_id, exception_type").eq("id", id).single();
  if (!exception) fail(EXCEPTIONS_BASE, "Exception tidak ditemukan.");

  await resolveOne(supabase, exception, {
    resolvedOutletId: str(formData, "resolved_outlet_id"),
    resolvedCoaId: str(formData, "resolved_coa_id"),
    resolutionNote: str(formData, "resolution_note"),
    createRuleOnResolve: formData.get("create_rule_on_resolve") === "on",
    userId: user.id,
  });

  revalidatePath(EXCEPTIONS_BASE);
  redirect(EXCEPTIONS_BASE);
}

export async function bulkResolveExceptions(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, EXCEPTIONS_BASE);

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) fail(EXCEPTIONS_BASE, "Pilih minimal satu exception untuk diselesaikan bersama.");

  const resolvedOutletId = str(formData, "resolved_outlet_id");
  const resolvedCoaId = str(formData, "resolved_coa_id");
  const createRuleOnResolve = formData.get("create_rule_on_resolve") === "on";

  const { data: exceptions } = await supabase.from("exceptions").select("id, source_id, exception_type").in("id", ids);

  for (const exception of exceptions ?? []) {
    await resolveOne(supabase, exception, {
      resolvedOutletId,
      resolvedCoaId,
      resolutionNote: `Bulk resolve (${ids.length} exceptions sekaligus).`,
      createRuleOnResolve,
      userId: user.id,
    });
  }

  await logAudit(supabase, {
    userId: user.id,
    action: "exceptions_bulk_resolved",
    entityTable: "exceptions",
    entityId: ids[0]!,
    newValue: { count: ids.length, resolvedOutletId, resolvedCoaId },
  });

  revalidatePath(EXCEPTIONS_BASE);
  redirect(EXCEPTIONS_BASE);
}

export async function ignoreException(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, EXCEPTIONS_BASE);
  const id = formData.get("id") as string;
  const note = str(formData, "resolution_note");

  const { error } = await supabase
    .from("exceptions")
    .update({ status: "ignored", resolution_note: note, resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(EXCEPTIONS_BASE, error.message);

  await logAudit(supabase, { userId: user.id, action: "exception_ignored", entityTable: "exceptions", entityId: id, newValue: { note } });

  revalidatePath(EXCEPTIONS_BASE);
  redirect(EXCEPTIONS_BASE);
}
