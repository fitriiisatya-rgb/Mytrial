"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";
import { parseSpreadsheet } from "@/lib/import/spreadsheet-parse";
import { resolveColumnMapping, cellAt, BANK_EXPENSE_MAPPING, REVENUE_MAPPING } from "@/lib/import/column-mapping";
import { classifyBankRows, type RawBankRowInput } from "@/lib/import/classify-bank-row";
import { classifyRevenueRows, type RawRevenueRowInput } from "@/lib/import/classify-revenue-row";
import { chunkedInsert } from "@/lib/import/chunked-insert";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = "/import/sources";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

export async function saveSourceConfig(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string | null;
  const row = {
    entity_id: formData.get("entity_id") as string,
    source_type: formData.get("source_type") as Database["public"]["Enums"]["import_source_type"],
    target: formData.get("target") as "bank_expense" | "revenue",
    name: str(formData, "name")!,
    spreadsheet_id: str(formData, "spreadsheet_id"),
    sheet_name: str(formData, "sheet_name"),
    header_row: Number(formData.get("header_row") ?? 1),
    revenue_source_id: str(formData, "revenue_source_id"),
    active: formData.get("active") === "on",
    created_by: user.id,
  };

  const { error } = id
    ? await supabase.from("import_source_configs").update(row).eq("id", id)
    : await supabase.from("import_source_configs").insert(row);

  if (error) {
    if (error.code === "23505") fail(`Nama sumber "${row.name}" sudah digunakan untuk entitas ini.`);
    fail(error.message);
  }

  revalidatePath(BASE);
  redirect(BASE);
}

export async function toggleSourceConfigActive(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const { error } = await supabase.from("import_source_configs").update({ active: !active }).eq("id", id);
  if (error) fail(error.message);
  revalidatePath(BASE);
  redirect(BASE);
}

function csvExportUrl(spreadsheetId: string, sheetName: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function fetchExistingDedupeKeys(
  supabase: SupabaseClient<Database>,
  table: "bank_transactions_raw" | "revenue_transactions_raw",
  keys: string[]
): Promise<Set<string>> {
  const existing = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const { data } = await supabase.from(table).select("dedupe_key").in("dedupe_key", chunk);
    for (const row of data ?? []) if (row.dedupe_key) existing.add(row.dedupe_key);
  }
  return existing;
}

/**
 * Google Sheet sync. Requires the sheet to be shared "Anyone with the
 * link can view" — no service-account credentials needed for that case,
 * fetched via Sheets' own public CSV export endpoint. A private sheet
 * needs the Google Sheets API v4 with a service account
 * (GOOGLE_SERVICE_ACCOUNT_JSON), which is not implemented here — see
 * PHASE3_VALIDATION_REPORT.md for exactly what that would take. Unlike
 * a manual file upload (spec M requires a preview the user can cancel),
 * a scheduled/triggered sync commits directly, matching how a "Sync Now"
 * action is expected to behave.
 */
export async function syncGoogleSheetNow(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const configId = formData.get("config_id") as string;
  const { data: config } = await supabase.from("import_source_configs").select("*").eq("id", configId).single();
  if (!config) fail("Konfigurasi sumber tidak ditemukan.");
  if (!config.spreadsheet_id || !config.sheet_name) {
    fail("Konfigurasi ini belum memiliki spreadsheet ID / nama sheet.");
  }

  let csvText: string;
  try {
    const response = await fetch(csvExportUrl(config.spreadsheet_id, config.sheet_name), { cache: "no-store" });
    if (!response.ok) {
      fail(
        `Gagal mengambil data Google Sheet (HTTP ${response.status}). Pastikan sheet dibagikan sebagai "Anyone with the link can view".`
      );
    }
    csvText = await response.text();
  } catch (e) {
    fail(`Gagal terhubung ke Google Sheets: ${e instanceof Error ? e.message : String(e)}`);
  }

  const bytes = Buffer.from(csvText, "utf-8");
  const { headers, rows } = parseSpreadsheet(bytes, { isCsv: true, headerRow: config.header_row });

  const startedAt = new Date().toISOString();

  if (config.target === "bank_expense") {
    const mapping = resolveColumnMapping(headers, BANK_EXPENSE_MAPPING, config.column_mapping as Record<string, string>);
    if (mapping.missingRequired.length > 0) {
      fail(`Kolom wajib tidak ditemukan di sheet: ${mapping.missingRequired.join(", ")}.`);
    }
    const rawRows: RawBankRowInput[] = rows.map((r, i) => ({
      rowNumber: i + 1,
      bank: cellAt(r, mapping.indices.bank!) as string | null,
      date: cellAt(r, mapping.indices.date!),
      unit: cellAt(r, mapping.indices.unit!) as string | null,
      classification: cellAt(r, mapping.indices.classification!) as string | null,
      description: cellAt(r, mapping.indices.description!) as string | null,
      debit: cellAt(r, mapping.indices.debit!),
      credit: cellAt(r, mapping.indices.credit!),
      balance: cellAt(r, mapping.indices.balance!),
      externalRef: cellAt(r, mapping.indices.externalRef!) as string | null,
    }));
    const { data: banks } = await supabase.from("banks").select("id, bank_name").eq("entity_id", config.entity_id);
    const draft = classifyBankRows({ source: "google_sheet", rows: rawRows, banks: banks ?? [], existingDedupeKeys: new Set() });
    const existingDedupeKeys = await fetchExistingDedupeKeys(supabase, "bank_transactions_raw", draft.rows.map((r) => r.dedupeKey));
    const result = classifyBankRows({ source: "google_sheet", rows: rawRows, banks: banks ?? [], existingDedupeKeys });

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        source: "google_sheet",
        source_ref: `${config.spreadsheet_id}#${config.sheet_name}`,
        source_name: config.name,
        entity_id: config.entity_id,
        imported_by: user.id,
        started_at: startedAt,
        row_count: result.summary.totalRows,
        status: "processing",
      })
      .select("id")
      .single();
    if (batchError) fail(batchError.message);

    const toInsert = result.rows.filter((r) => r.insertable && r.status !== "duplicate_exact");
    const rowErrors = result.rows.filter((r) => !r.insertable);
    const EXCEPTION_TYPE: Partial<Record<string, Database["public"]["Enums"]["exception_type"]>> = {
      bank_not_found: "bank_not_found",
      invalid_amount: "invalid_amount",
      malformed_row: "malformed_data",
      duplicate_suspected: "duplicate_suspected",
    };
    const insertedIds = await chunkedInsert(
      supabase,
      "bank_transactions_raw",
      toInsert.map((r) => ({
        import_batch_id: batch.id,
        bank_id: r.bankId,
        bank_label_raw: r.bankLabel,
        txn_date: r.date!,
        unit_raw: r.unit,
        classification_raw: r.classification,
        description_raw: r.description,
        debit: r.debit,
        credit: r.credit,
        running_balance: r.balance,
        external_ref: r.externalRef,
        source_row_ref: String(r.rowNumber),
        fingerprint: r.fingerprint,
        raw_payload: r.raw as unknown as Record<string, unknown>,
        exception_status: EXCEPTION_TYPE[r.status] ? ("open" as const) : null,
      }))
    );
    const exceptionRows = toInsert
      .map((r, i) => ({ row: r, id: insertedIds[i]?.id }))
      .filter(({ row }) => EXCEPTION_TYPE[row.status])
      .map(({ row, id }) => ({
        source_table: "bank_transactions_raw" as const,
        source_id: id!,
        exception_type: EXCEPTION_TYPE[row.status]!,
        status: "open" as const,
      }));
    if (exceptionRows.length > 0) await chunkedInsert(supabase, "exceptions", exceptionRows);
    if (rowErrors.length > 0) {
      await chunkedInsert(
        supabase,
        "import_row_errors",
        rowErrors.map((r) => ({
          import_batch_id: batch.id,
          row_number: r.rowNumber,
          error_code: r.status,
          error_message: r.errorMessage ?? "Baris tidak valid.",
          raw_payload: r.raw as unknown as Record<string, unknown>,
        }))
      );
    }
    const hasErrors = result.summary.invalidDate + result.summary.invalidAmount + result.summary.malformedRow + result.summary.bankNotFound > 0;
    await supabase
      .from("import_batches")
      .update({
        status: hasErrors ? "completed_with_errors" : "completed",
        completed_at: new Date().toISOString(),
        valid_rows: result.summary.expenseCandidates + result.summary.debitOnlyIgnored,
        duplicate_count: result.summary.duplicateExact,
        skipped_rows: result.summary.duplicateSuspected,
        error_count: result.summary.invalidDate + result.summary.invalidAmount + result.summary.malformedRow + result.summary.bankNotFound,
      })
      .eq("id", batch.id);
    await logAudit(supabase, { userId: user.id, action: "google_sheet_sync_bank_expense", entityTable: "import_batches", entityId: batch.id, newValue: result.summary });
  } else {
    if (!config.revenue_source_id) {
      fail("Konfigurasi sumber Penerimaan ini belum memiliki Revenue Source — atur lewat form Sumber Data.");
    }
    const { data: revenueSource } = await supabase.from("revenue_sources").select("id, code").eq("id", config.revenue_source_id).single();
    if (!revenueSource) fail("Revenue Source pada konfigurasi ini tidak ditemukan.");

    const mapping = resolveColumnMapping(headers, REVENUE_MAPPING, config.column_mapping as Record<string, string>);
    if (mapping.missingRequired.length > 0) {
      fail(`Kolom wajib tidak ditemukan di sheet: ${mapping.missingRequired.join(", ")}.`);
    }
    const rawRows: RawRevenueRowInput[] = rows.map((r, i) => ({
      rowNumber: i + 1,
      date: cellAt(r, mapping.indices.date!),
      outlet: cellAt(r, mapping.indices.outlet!) as string | null,
      description: cellAt(r, mapping.indices.description!) as string | null,
      revenueCategory: cellAt(r, mapping.indices.revenueCategory!) as string | null,
      amount: cellAt(r, mapping.indices.amount!),
      externalRef: cellAt(r, mapping.indices.externalRef!) as string | null,
    }));

    const { data: outlets } = await supabase.from("outlets").select("id, outlet_code, outlet_name");
    const draft = classifyRevenueRows({
      source: "google_sheet",
      revenueSourceCode: revenueSource.code,
      rows: rawRows,
      outlets: outlets ?? [],
      existingDedupeKeys: new Set(),
    });
    const existingDedupeKeys = await fetchExistingDedupeKeys(supabase, "revenue_transactions_raw", draft.rows.map((r) => r.dedupeKey));
    const result = classifyRevenueRows({
      source: "google_sheet",
      revenueSourceCode: revenueSource.code,
      rows: rawRows,
      outlets: outlets ?? [],
      existingDedupeKeys,
    });

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        source: "google_sheet",
        source_ref: `${config.spreadsheet_id}#${config.sheet_name}`,
        source_name: config.name,
        entity_id: config.entity_id,
        imported_by: user.id,
        started_at: startedAt,
        row_count: result.summary.totalRows,
        status: "processing",
      })
      .select("id")
      .single();
    if (batchError) fail(batchError.message);

    const toInsert = result.rows.filter((r) => r.insertable && r.status !== "duplicate_exact");
    const rowErrors = result.rows.filter((r) => !r.insertable);
    const EXCEPTION_TYPE: Partial<Record<string, Database["public"]["Enums"]["exception_type"]>> = {
      outlet_not_detected: "outlet_not_detected",
      invalid_amount: "invalid_amount",
      malformed_row: "malformed_data",
      duplicate_suspected: "duplicate_suspected",
    };
    const insertedIds = await chunkedInsert(
      supabase,
      "revenue_transactions_raw",
      toInsert.map((r) => ({
        import_batch_id: batch.id,
        revenue_source_id: config.revenue_source_id!,
        txn_date: r.date!,
        outlet_id: r.outletId,
        outlet_raw: r.outletLabel,
        description: r.description,
        revenue_category: r.revenueCategory,
        amount: r.amount,
        external_ref: r.externalRef,
        fingerprint: r.fingerprint,
        raw_payload: r.raw as unknown as Record<string, unknown>,
      }))
    );
    const exceptionRows = toInsert
      .map((r, i) => ({ row: r, id: insertedIds[i]?.id }))
      .filter(({ row }) => EXCEPTION_TYPE[row.status])
      .map(({ row, id }) => ({
        source_table: "revenue_transactions_raw" as const,
        source_id: id!,
        exception_type: EXCEPTION_TYPE[row.status]!,
        status: "open" as const,
      }));
    if (exceptionRows.length > 0) await chunkedInsert(supabase, "exceptions", exceptionRows);
    if (rowErrors.length > 0) {
      await chunkedInsert(
        supabase,
        "import_row_errors",
        rowErrors.map((r) => ({
          import_batch_id: batch.id,
          row_number: r.rowNumber,
          error_code: r.status,
          error_message: r.errorMessage ?? "Baris tidak valid.",
          raw_payload: r.raw as unknown as Record<string, unknown>,
        }))
      );
    }
    const hasErrors = result.summary.invalidDate + result.summary.invalidAmount + result.summary.malformedRow + result.summary.outletNotDetected > 0;
    await supabase
      .from("import_batches")
      .update({
        status: hasErrors ? "completed_with_errors" : "completed",
        completed_at: new Date().toISOString(),
        valid_rows: result.summary.valid,
        duplicate_count: result.summary.duplicateExact,
        skipped_rows: result.summary.duplicateSuspected,
        error_count: result.summary.invalidDate + result.summary.invalidAmount + result.summary.malformedRow + result.summary.outletNotDetected,
      })
      .eq("id", batch.id);
    await logAudit(supabase, { userId: user.id, action: "google_sheet_sync_revenue", entityTable: "import_batches", entityId: batch.id, newValue: result.summary });
  }

  await supabase.from("import_source_configs").update({ last_sync_at: new Date().toISOString() }).eq("id", configId);
  revalidatePath(BASE);
  redirect(BASE);
}
