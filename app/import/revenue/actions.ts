"use server";

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";
import { parseSpreadsheet } from "@/lib/import/spreadsheet-parse";
import { resolveColumnMapping, cellAt, REVENUE_MAPPING } from "@/lib/import/column-mapping";
import { classifyRevenueRows, type RawRevenueRowInput, type ClassifiedRevenueRow } from "@/lib/import/classify-revenue-row";
import { chunkedInsert } from "@/lib/import/chunked-insert";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const PREVIEW_SAMPLE_SIZE = 50;

export interface RevenueImportPreview {
  headers: string[];
  missingRequired: string[];
  summary: ReturnType<typeof classifyRevenueRows>["summary"];
  sample: ClassifiedRevenueRow[];
}

function mappingOverridesFromForm(formData: FormData): Record<string, string | null> {
  return {
    date: formData.get("map_date") as string | null,
    outlet: formData.get("map_outlet") as string | null,
    description: formData.get("map_description") as string | null,
    revenueCategory: formData.get("map_revenue_category") as string | null,
    amount: formData.get("map_amount") as string | null,
    externalRef: formData.get("map_external_ref") as string | null,
  };
}

async function parseAndClassify(formData: FormData, supabase: SupabaseClient<Database>) {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Pilih file CSV atau Excel terlebih dahulu.");

  const isCsv = file.name.toLowerCase().endsWith(".csv");
  const bytes = Buffer.from(await file.arrayBuffer());
  const { headers, rows } = parseSpreadsheet(bytes, { isCsv });

  const overrides = mappingOverridesFromForm(formData);
  const mapping = resolveColumnMapping(headers, REVENUE_MAPPING, overrides);
  if (mapping.missingRequired.length > 0) {
    return { headers, mapping, rawRows: [] as RawRevenueRowInput[], file, isCsv, outlets: [] as { id: string; outlet_code: string; outlet_name: string }[] };
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

  return { headers, mapping, rawRows, file, isCsv, outlets: outlets ?? [] };
}

async function fetchExistingDedupeKeys(supabase: SupabaseClient<Database>, keys: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const { data } = await supabase.from("revenue_transactions_raw").select("dedupe_key").in("dedupe_key", chunk);
    for (const row of data ?? []) if (row.dedupe_key) existing.add(row.dedupe_key);
  }
  return existing;
}

export async function previewRevenueImport(formData: FormData): Promise<RevenueImportPreview> {
  const supabase = await createClient();
  const revenueSourceCode = formData.get("revenue_source_code") as string;
  if (!revenueSourceCode) throw new Error("Pilih revenue source terlebih dahulu.");

  const { headers, mapping, rawRows, outlets } = await parseAndClassify(formData, supabase);
  if (mapping.missingRequired.length > 0) {
    return { headers, missingRequired: mapping.missingRequired, summary: emptySummary(rawRows.length), sample: [] };
  }

  const draftKeys = classifyRevenueRows({ source: "csv_upload", revenueSourceCode, rows: rawRows, outlets, existingDedupeKeys: new Set() });
  const existingDedupeKeys = await fetchExistingDedupeKeys(supabase, draftKeys.rows.map((r) => r.dedupeKey));
  const result = classifyRevenueRows({ source: "csv_upload", revenueSourceCode, rows: rawRows, outlets, existingDedupeKeys });

  return { headers, missingRequired: [], summary: result.summary, sample: result.rows.slice(0, PREVIEW_SAMPLE_SIZE) };
}

function emptySummary(totalRows: number) {
  return { totalRows, valid: 0, outletNotDetected: 0, invalidDate: 0, invalidAmount: 0, malformedRow: 0, duplicateExact: 0, duplicateSuspected: 0 };
}

const EXCEPTION_TYPE_FOR_STATUS: Partial<Record<ClassifiedRevenueRow["status"], Database["public"]["Enums"]["exception_type"]>> = {
  outlet_not_detected: "outlet_not_detected",
  invalid_amount: "invalid_amount",
  malformed_row: "malformed_data",
  duplicate_suspected: "duplicate_suspected",
};

export async function commitRevenueImport(formData: FormData): Promise<{ batchId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi berakhir, silakan login kembali.");

  const revenueSourceId = formData.get("revenue_source_id") as string;
  const revenueSourceCode = formData.get("revenue_source_code") as string;
  const entityId = formData.get("entity_id") as string;
  if (!revenueSourceId || !entityId) throw new Error("Pilih entitas dan revenue source terlebih dahulu.");

  const { rawRows, outlets, file, isCsv } = await parseAndClassify(formData, supabase);
  const draftKeys = classifyRevenueRows({ source: "csv_upload", revenueSourceCode, rows: rawRows, outlets, existingDedupeKeys: new Set() });
  const existingDedupeKeys = await fetchExistingDedupeKeys(supabase, draftKeys.rows.map((r) => r.dedupeKey));
  const result = classifyRevenueRows({ source: "csv_upload", revenueSourceCode, rows: rawRows, outlets, existingDedupeKeys });

  const startedAt = new Date().toISOString();
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      source: isCsv ? "csv_upload" : "excel_upload",
      source_ref: file.name,
      source_name: file.name,
      entity_id: entityId,
      imported_by: user.id,
      started_at: startedAt,
      row_count: result.summary.totalRows,
      status: "processing",
    })
    .select("id")
    .single();
  if (batchError) throw new Error(batchError.message);
  const batchId = batch.id;

  const toInsert = result.rows.filter((r) => r.insertable && r.status !== "duplicate_exact");
  const rowErrors = result.rows.filter((r) => !r.insertable);

  const insertedIds = await chunkedInsert(
    supabase,
    "revenue_transactions_raw",
    toInsert.map((r) => ({
      import_batch_id: batchId,
      revenue_source_id: revenueSourceId,
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
    .filter(({ row }) => EXCEPTION_TYPE_FOR_STATUS[row.status])
    .map(({ row, id }) => ({
      source_table: "revenue_transactions_raw" as const,
      source_id: id!,
      exception_type: EXCEPTION_TYPE_FOR_STATUS[row.status]!,
      status: "open" as const,
    }));
  if (exceptionRows.length > 0) {
    await chunkedInsert(supabase, "exceptions", exceptionRows);
  }

  if (rowErrors.length > 0) {
    await chunkedInsert(
      supabase,
      "import_row_errors",
      rowErrors.map((r) => ({
        import_batch_id: batchId,
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
    .eq("id", batchId);

  await logAudit(supabase, {
    userId: user.id,
    action: "revenue_import_committed",
    entityTable: "import_batches",
    entityId: batchId,
    newValue: result.summary,
  });

  return { batchId };
}
