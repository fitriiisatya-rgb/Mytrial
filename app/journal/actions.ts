"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";
import { toSen } from "@/lib/money";
import { buildBankExpenseJournal } from "@/lib/journal/build-bank-expense-journal";
import { buildRevenueJournal } from "@/lib/journal/build-revenue-journal";
import { buildInterbankTransferJournal } from "@/lib/journal/build-interbank-transfer-journal";
import { buildSharedCostJournal } from "@/lib/journal/build-shared-cost-journal";
import { buildManualJournal } from "@/lib/journal/build-manual-journal";
import { suggestTransferPair } from "@/lib/journal/transfer-pairing";
import type { JournalDraft } from "@/lib/journal/types";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = "/journal";

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

async function resolveAccountingPeriod(supabase: SupabaseClient<Database>, entityId: string, isoDate: string): Promise<string | null> {
  const d = new Date(isoDate);
  const { data } = await supabase
    .from("accounting_periods")
    .select("id")
    .eq("entity_id", entityId)
    .eq("period_year", d.getUTCFullYear())
    .eq("period_month", d.getUTCMonth() + 1)
    .maybeSingle();
  return data?.id ?? null;
}

export interface JournalInsertOutcome {
  key: string; // caller-chosen label for reporting (e.g. source row id)
  status: "created" | "already_exists" | "failed";
  journalId?: string;
  error?: string;
}

/**
 * Inserts one journal (header + lines) from a pure JournalDraft.
 * uq_journal_source_active (0017) is what actually makes this
 * idempotent — a unique_violation here always means "this source
 * already has an active journal," never a real failure, and is reported
 * as `already_exists`, not `failed` (spec M: never duplicate; spec L:
 * a bulk run must say clearly what happened to each row, not silently
 * skip). Every other insert error is a genuine `failed` outcome.
 */
async function insertJournalDraft(
  supabase: SupabaseClient<Database>,
  draft: JournalDraft,
  accountingPeriodId: string,
  createdBy: string,
  key: string
): Promise<JournalInsertOutcome> {
  const { data: header, error: headerError } = await supabase
    .from("journal_headers")
    .insert({
      journal_date: draft.journalDate,
      source_type: draft.sourceType,
      source_id: draft.sourceId,
      batch_id: draft.batchId,
      entity_id: draft.entityId,
      accounting_period_id: accountingPeriodId,
      status: "draft",
      description: draft.description,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (headerError) {
    if (headerError.code === "23505") return { key, status: "already_exists" };
    return { key, status: "failed", error: headerError.message };
  }

  const journalId = header.id;
  const { error: linesError } = await supabase.from("journal_lines").insert(
    draft.lines.map((l, i) => ({
      journal_id: journalId,
      line_no: i + 1,
      coa_id: l.coaId,
      entity_id: l.entityId,
      outlet_id: l.outletId,
      bank_account_id: l.bankAccountId,
      department_id: l.departmentId,
      cost_center_id: l.costCenterId,
      debit: (Number(l.debitSen) / 100).toFixed(2),
      credit: (Number(l.creditSen) / 100).toFixed(2),
      description: l.description,
    }))
  );

  if (linesError) {
    // The header row is orphaned (no lines) — delete it so a retry
    // isn't blocked by uq_journal_source_active pointing at a dead draft.
    await supabase.from("journal_headers").delete().eq("id", journalId);
    return { key, status: "failed", error: linesError.message };
  }

  return { key, status: "created", journalId };
}

// =====================================================================
// BULK GENERATE DRAFT (spec A/L/M): scans mapped, not-yet-journaled rows
// and generates one draft journal each. Interbank-flagged and shared-
// cost-flagged rows are deliberately excluded here — they go through
// their own confirm/allocate workflow below before a journal exists for
// them at all (spec E/F: never posted as a normal expense).
// =====================================================================
export async function generateDraftJournals(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, BASE);
  const entityId = formData.get("entity_id") as string;
  if (!entityId) fail(BASE, "Pilih entitas terlebih dahulu.");

  const { data: banks } = await supabase.from("banks").select("id, coa_id, entity_id").eq("entity_id", entityId);
  const bankIds = (banks ?? []).map((b) => b.id);
  const bankById = new Map((banks ?? []).map((b) => [b.id, b]));

  const outcomes: JournalInsertOutcome[] = [];

  if (bankIds.length > 0) {
    const { data: rows } = await supabase
      .from("bank_transactions_raw")
      .select("id, import_batch_id, bank_id, txn_date, detected_outlet_id, detected_coa_id, credit, description_raw")
      .in("bank_id", bankIds)
      .gt("credit", 0)
      .not("detected_coa_id", "is", null)
      .eq("is_interbank_transfer", false)
      .eq("is_shared_cost_candidate", false)
      .eq("processed", false)
      .is("exception_status", null);

    for (const row of rows ?? []) {
      const bank = bankById.get(row.bank_id!);
      if (!bank) {
        outcomes.push({ key: row.id, status: "failed", error: "Bank tidak ditemukan." });
        continue;
      }
      const periodId = await resolveAccountingPeriod(supabase, entityId, row.txn_date);
      if (!periodId) {
        outcomes.push({ key: row.id, status: "failed", error: `Tidak ada accounting period untuk ${row.txn_date}.` });
        continue;
      }
      try {
        const draft = buildBankExpenseJournal({
          bankTransactionId: row.id,
          importBatchId: row.import_batch_id,
          entityId,
          txnDate: row.txn_date,
          detectedOutletId: row.detected_outlet_id,
          detectedCoaId: row.detected_coa_id!,
          bankId: row.bank_id!,
          bankCoaId: bank.coa_id,
          creditSen: toSen(row.credit),
          description: row.description_raw,
        });
        const outcome = await insertJournalDraft(supabase, draft, periodId, user.id, row.id);
        outcomes.push(outcome);
        if (outcome.status === "created") {
          await supabase.from("bank_transactions_raw").update({ processed: true, journal_id: outcome.journalId }).eq("id", row.id);
        }
      } catch (e) {
        outcomes.push({ key: row.id, status: "failed", error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  const { data: revenueRows } = await supabase
    .from("revenue_transactions_raw")
    .select("id, import_batch_id, txn_date, outlet_id, amount, description, revenue_source_id, revenue_sources(clearing_coa_id)")
    .eq("processed", false)
    .not("outlet_id", "is", null);

  const { data: revenueCoa } = await supabase.from("coa").select("id").eq("account_type", "revenue").eq("active", true).limit(1).maybeSingle();

  for (const row of revenueRows ?? []) {
    if (!revenueCoa) {
      outcomes.push({ key: row.id, status: "failed", error: "Tidak ada COA bertipe revenue yang aktif." });
      continue;
    }
    const periodId = await resolveAccountingPeriod(supabase, entityId, row.txn_date);
    if (!periodId) {
      outcomes.push({ key: row.id, status: "failed", error: `Tidak ada accounting period untuk ${row.txn_date}.` });
      continue;
    }
    try {
      const draft = buildRevenueJournal({
        revenueTransactionId: row.id,
        importBatchId: row.import_batch_id,
        entityId,
        txnDate: row.txn_date,
        outletId: row.outlet_id,
        clearingCoaId: row.revenue_sources!.clearing_coa_id,
        revenueCoaId: revenueCoa.id,
        amountSen: toSen(row.amount),
        description: row.description,
      });
      const outcome = await insertJournalDraft(supabase, draft, periodId, user.id, row.id);
      outcomes.push(outcome);
      if (outcome.status === "created") {
        await supabase.from("revenue_transactions_raw").update({ processed: true, journal_id: outcome.journalId }).eq("id", row.id);
      }
    } catch (e) {
      outcomes.push({ key: row.id, status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  await logAudit(supabase, {
    userId: user.id,
    action: "journals_bulk_generated",
    entityTable: "journal_headers",
    entityId,
    newValue: {
      created: outcomes.filter((o) => o.status === "created").length,
      already_exists: outcomes.filter((o) => o.status === "already_exists").length,
      failed: outcomes.filter((o) => o.status === "failed").length,
      failures: outcomes.filter((o) => o.status === "failed"),
    },
  });

  revalidatePath(BASE);
  const created = outcomes.filter((o) => o.status === "created").length;
  const failed = outcomes.filter((o) => o.status === "failed");
  if (failed.length > 0) {
    fail(BASE, `${created} draft dibuat, ${failed.length} gagal: ${failed.map((f) => `${f.key.slice(0, 8)} (${f.error})`).join("; ")}`);
  }
  redirect(`${BASE}?generated=${created}`);
}

// =====================================================================
// WORKFLOW ACTIONS — thin wrappers over the guarded SQL functions
// (0017). Every rule (who may do what, from which prior status, balance
// on approve/post, period lock) lives in the database function, not
// here — this file only surfaces the result.
// =====================================================================

// No actor parameter: these RPCs derive the actor from auth.uid()/
// auth_role() inside the database function itself (0017) — a
// client-supplied actor id would be meaningless anyway, since
// `profiles` RLS only ever lets a session read its own row.
async function callWorkflowRpc(
  supabase: SupabaseClient<Database>,
  fn: "fn_review_journal" | "fn_approve_journal" | "fn_post_journal",
  journalId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc(fn, { p_journal_id: journalId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reviewJournalAction(formData: FormData) {
  const supabase = await createClient();
  await requireUser(supabase, BASE);
  const id = formData.get("id") as string;
  const result = await callWorkflowRpc(supabase, "fn_review_journal", id);
  if (!result.ok) fail(BASE, result.error);
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`);
  redirect(`${BASE}/${id}`);
}

export async function approveJournalAction(formData: FormData) {
  const supabase = await createClient();
  await requireUser(supabase, BASE);
  const id = formData.get("id") as string;
  const result = await callWorkflowRpc(supabase, "fn_approve_journal", id);
  if (!result.ok) fail(BASE, result.error);
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`);
  redirect(`${BASE}/${id}`);
}

export async function postJournalAction(formData: FormData) {
  const supabase = await createClient();
  await requireUser(supabase, BASE);
  const id = formData.get("id") as string;
  const result = await callWorkflowRpc(supabase, "fn_post_journal", id);
  if (!result.ok) fail(BASE, result.error);
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`);
  redirect(`${BASE}/${id}`);
}

export async function reverseJournalAction(formData: FormData) {
  const supabase = await createClient();
  await requireUser(supabase, BASE);
  const id = formData.get("id") as string;
  const reversalDate = formData.get("reversal_date") as string;
  const reason = str(formData, "reason");

  const { error } = await supabase.rpc("fn_reverse_journal", {
    p_journal_id: id,
    p_reversal_date: reversalDate,
    p_reason: reason,
  });
  if (error) fail(`${BASE}/${id}`, error.message);
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`);
  redirect(`${BASE}/${id}`);
}

export interface BulkWorkflowResult {
  succeeded: string[];
  failed: { id: string; error: string }[];
}

async function bulkWorkflow(
  supabase: SupabaseClient<Database>,
  fn: "fn_review_journal" | "fn_approve_journal" | "fn_post_journal",
  ids: string[]
): Promise<BulkWorkflowResult> {
  const result: BulkWorkflowResult = { succeeded: [], failed: [] };
  for (const id of ids) {
    const outcome = await callWorkflowRpc(supabase, fn, id);
    if (outcome.ok) result.succeeded.push(id);
    else result.failed.push({ id, error: outcome.error });
  }
  return result;
}

/**
 * Spec L — Bulk Journal Workflow: applies one action to many journals,
 * one RPC call per journal (each independently guarded by role/status/
 * balance) — a failure on one journal is reported by id and reason, the
 * rest still proceed, never a silent skip.
 */
export async function bulkWorkflowAction(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, BASE);
  const action = formData.get("action") as "review" | "approve" | "post";
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) fail(BASE, "Pilih minimal satu jurnal.");

  const fn = action === "review" ? "fn_review_journal" : action === "approve" ? "fn_approve_journal" : "fn_post_journal";
  const result = await bulkWorkflow(supabase, fn, ids);

  await logAudit(supabase, {
    userId: user.id,
    action: `journals_bulk_${action}`,
    entityTable: "journal_headers",
    entityId: ids[0]!,
    newValue: { ...result },
  });

  revalidatePath(BASE);
  if (result.failed.length > 0) {
    fail(
      BASE,
      `${result.succeeded.length} berhasil, ${result.failed.length} gagal: ${result.failed.map((f) => `${f.id.slice(0, 8)} (${f.error})`).join("; ")}`
    );
  }
  redirect(`${BASE}?bulk_ok=${result.succeeded.length}`);
}

// =====================================================================
// MANUAL JOURNAL (spec P)
// =====================================================================
export async function createManualJournal(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, `${BASE}/manual`);

  const entityId = formData.get("entity_id") as string;
  const journalDate = formData.get("journal_date") as string;
  const description = str(formData, "description");
  if (!entityId || !journalDate) fail(`${BASE}/manual`, "Entitas dan tanggal wajib diisi.");

  const coaIds = formData.getAll("line_coa_id").map(String);
  const outletIds = formData.getAll("line_outlet_id").map(String);
  const debits = formData.getAll("line_debit").map(String);
  const credits = formData.getAll("line_credit").map(String);
  const lineDescriptions = formData.getAll("line_description").map(String);

  const lines = coaIds.map((coaId, i) => ({
    coaId,
    outletId: outletIds[i]?.trim() || null,
    debitSen: toSen(debits[i]?.trim() || "0"),
    creditSen: toSen(credits[i]?.trim() || "0"),
    description: lineDescriptions[i]?.trim() || null,
  }));

  const result = buildManualJournal({ entityId, journalDate, description, lines });
  if (!result.draft) fail(`${BASE}/manual`, result.errors.join(" "));

  const periodId = await resolveAccountingPeriod(supabase, entityId, journalDate);
  if (!periodId) fail(`${BASE}/manual`, `Tidak ada accounting period untuk ${journalDate}.`);

  const outcome = await insertJournalDraft(supabase, result.draft, periodId, user.id, "manual");
  if (outcome.status !== "created") fail(`${BASE}/manual`, outcome.error ?? "Gagal membuat jurnal manual.");

  await logAudit(supabase, { userId: user.id, action: "manual_journal_created", entityTable: "journal_headers", entityId: outcome.journalId! });

  revalidatePath(BASE);
  redirect(`${BASE}/${outcome.journalId}`);
}

// =====================================================================
// INTERBANK TRANSFER WORKFLOW (spec E)
// =====================================================================
export async function suggestAndCreateTransfer(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, `${BASE}/transfers`);
  const sourceTransactionId = formData.get("source_transaction_id") as string;

  const { data: source } = await supabase
    .from("bank_transactions_raw")
    .select("id, bank_id, txn_date, credit")
    .eq("id", sourceTransactionId)
    .single();
  if (!source) fail(`${BASE}/transfers`, "Transaksi sumber tidak ditemukan.");

  const { data: candidates } = await supabase
    .from("bank_transactions_raw")
    .select("id, bank_id, txn_date, debit")
    .gt("debit", 0)
    .neq("bank_id", source.bank_id as string);

  const suggestion = suggestTransferPair(
    { bankId: source.bank_id!, txnDate: source.txn_date, creditSen: toSen(source.credit) },
    (candidates ?? []).map((c) => ({ id: c.id, bankId: c.bank_id!, txnDate: c.txn_date, debitSen: toSen(c.debit) }))
  );

  const { error } = await supabase.from("bank_transfers").upsert(
    {
      source_transaction_id: sourceTransactionId,
      source_bank_id: source.bank_id!,
      destination_transaction_id: suggestion?.destinationTransactionId ?? null,
      destination_bank_id: suggestion?.destinationBankId ?? null,
      amount: source.credit,
      transfer_date: source.txn_date,
      pairing_status: suggestion ? "suggested" : "unmatched",
      created_by: user.id,
    },
    { onConflict: "source_transaction_id" }
  );
  if (error) fail(`${BASE}/transfers`, error.message);

  revalidatePath(`${BASE}/transfers`);
  redirect(`${BASE}/transfers`);
}

export async function confirmTransfer(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, `${BASE}/transfers`);
  const id = formData.get("id") as string;
  const destinationTransactionId = str(formData, "destination_transaction_id");
  const destinationBankId = str(formData, "destination_bank_id");

  const { error } = await supabase
    .from("bank_transfers")
    .update({ destination_transaction_id: destinationTransactionId, destination_bank_id: destinationBankId, pairing_status: "confirmed" })
    .eq("id", id);
  if (error) fail(`${BASE}/transfers`, error.message);

  await logAudit(supabase, { userId: user.id, action: "transfer_confirmed", entityTable: "bank_transfers", entityId: id });
  revalidatePath(`${BASE}/transfers`);
  redirect(`${BASE}/transfers`);
}

export async function generateTransferJournal(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, `${BASE}/transfers`);
  const id = formData.get("id") as string;
  const entityId = formData.get("entity_id") as string;

  const { data: transfer } = await supabase.from("bank_transfers").select("*").eq("id", id).single();
  if (!transfer) fail(`${BASE}/transfers`, "Transfer tidak ditemukan.");
  if (transfer.pairing_status !== "confirmed") fail(`${BASE}/transfers`, "Konfirmasi pairing sebelum membuat jurnal.");

  const { data: sourceBank } = await supabase.from("banks").select("coa_id").eq("id", transfer.source_bank_id).single();
  const destinationBank = transfer.destination_bank_id
    ? (await supabase.from("banks").select("coa_id").eq("id", transfer.destination_bank_id).single()).data
    : null;
  const { data: clearingCoa } = await supabase.from("coa").select("id").eq("code", "1090").single();
  if (!sourceBank || !clearingCoa) fail(`${BASE}/transfers`, "Data COA transfer tidak lengkap.");

  const periodId = await resolveAccountingPeriod(supabase, entityId, transfer.transfer_date);
  if (!periodId) fail(`${BASE}/transfers`, `Tidak ada accounting period untuk ${transfer.transfer_date}.`);

  const draft = buildInterbankTransferJournal({
    bankTransferId: transfer.id,
    importBatchId: null,
    entityId,
    transferDate: transfer.transfer_date,
    sourceBankId: transfer.source_bank_id,
    sourceBankCoaId: sourceBank.coa_id,
    destinationBankId: transfer.destination_bank_id,
    destinationBankCoaId: destinationBank?.coa_id ?? null,
    transferClearingCoaId: clearingCoa.id,
    amountSen: toSen(transfer.amount),
    description: "Interbank/interunit transfer",
  });

  const outcome = await insertJournalDraft(supabase, draft, periodId, user.id, transfer.id);
  if (outcome.status === "failed") fail(`${BASE}/transfers`, outcome.error ?? "Gagal membuat jurnal transfer.");

  if (outcome.journalId) {
    await supabase.from("bank_transfers").update({ journal_id: outcome.journalId }).eq("id", id);
    await supabase.from("bank_transactions_raw").update({ processed: true, is_interbank_transfer: true }).eq("id", transfer.source_transaction_id);
    await supabase
      .from("exceptions")
      .update({ status: "resolved", resolved_by: user.id, resolved_at: new Date().toISOString(), resolution_note: "Interbank transfer journal generated." })
      .eq("source_table", "bank_transactions_raw")
      .eq("source_id", transfer.source_transaction_id)
      .eq("status", "open");
  }

  revalidatePath(`${BASE}/transfers`);
  redirect(outcome.journalId ? `${BASE}/${outcome.journalId}` : `${BASE}/transfers`);
}

// =====================================================================
// SHARED COST ALLOCATION (spec F)
// =====================================================================
export async function generateSharedCostAllocation(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase, `${BASE}/shared-cost`);

  const bankTransactionId = formData.get("bank_transaction_id") as string;
  const entityId = formData.get("entity_id") as string;
  const expenseCoaId = formData.get("expense_coa_id") as string;
  const outletIds = formData.getAll("outlet_id").map(String);
  // Weight inputs are named per-outlet-id (weight_<outletId>), not
  // positional — a plain "weight" list would misalign the moment any
  // outlet in the middle of the checkbox grid is left unchecked, since
  // unchecked checkboxes are dropped from FormData but their sibling
  // number input still submits.
  const weights = outletIds.map((id) => (formData.get(`weight_${id}`) as string | null) ?? "");

  const { data: row } = await supabase
    .from("bank_transactions_raw")
    .select("id, bank_id, txn_date, credit, description_raw, import_batch_id")
    .eq("id", bankTransactionId)
    .single();
  if (!row) fail(`${BASE}/shared-cost`, "Transaksi tidak ditemukan.");

  const { data: bank } = await supabase.from("banks").select("coa_id").eq("id", row.bank_id!).single();
  if (!bank) fail(`${BASE}/shared-cost`, "Bank tidak ditemukan.");

  const periodId = await resolveAccountingPeriod(supabase, entityId, row.txn_date);
  if (!periodId) fail(`${BASE}/shared-cost`, `Tidak ada accounting period untuk ${row.txn_date}.`);

  const hasWeights = weights.some((w) => w.trim() !== "");
  const outlets = outletIds.map((outletId, i) => ({ outletId, weight: hasWeights ? Number(weights[i] || 0) : undefined }));

  let draft;
  try {
    draft = buildSharedCostJournal({
      bankTransactionId,
      importBatchId: row.import_batch_id,
      entityId,
      txnDate: row.txn_date,
      expenseCoaId,
      bankId: row.bank_id!,
      bankCoaId: bank.coa_id,
      amountSen: toSen(row.credit),
      outlets,
      description: row.description_raw,
    });
  } catch (e) {
    fail(`${BASE}/shared-cost`, e instanceof Error ? e.message : String(e));
  }

  const outcome = await insertJournalDraft(supabase, draft, periodId, user.id, bankTransactionId);
  if (outcome.status === "failed") fail(`${BASE}/shared-cost`, outcome.error ?? "Gagal membuat jurnal alokasi.");

  if (outcome.journalId) {
    const { data: allocRule } = await supabase
      .from("allocation_rules")
      .insert({
        source_coa_id: expenseCoaId,
        method: hasWeights ? "custom_percentage" : "equal",
        effective_date: row.txn_date,
        total_amount: row.credit,
        resulting_journal_id: outcome.journalId,
        bank_transaction_id: bankTransactionId,
        active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (allocRule) {
      const outletLines = draft.lines.filter((l) => l.debitSen > 0n);
      await supabase.from("allocation_rule_outlets").insert(
        outletLines.map((l) => ({
          allocation_rule_id: allocRule.id,
          outlet_id: l.outletId!,
          percentage: hasWeights ? null : null,
          weight_basis: null,
          manual_amount: null,
          allocated_amount: (Number(l.debitSen) / 100).toFixed(2),
        }))
      );
    }

    await supabase.from("bank_transactions_raw").update({ processed: true }).eq("id", bankTransactionId);
    await supabase
      .from("exceptions")
      .update({ status: "resolved", resolved_by: user.id, resolved_at: new Date().toISOString(), resolution_note: "Shared cost allocation journal generated." })
      .eq("source_table", "bank_transactions_raw")
      .eq("source_id", bankTransactionId)
      .eq("status", "open");
  }

  revalidatePath(`${BASE}/shared-cost`);
  redirect(outcome.journalId ? `${BASE}/${outcome.journalId}` : `${BASE}/shared-cost`);
}
