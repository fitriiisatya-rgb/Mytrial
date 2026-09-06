"use server";

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";
import { parseSpreadsheet } from "@/lib/import/spreadsheet-parse";
import { resolveColumnMapping, cellAt, BANK_EXPENSE_MAPPING } from "@/lib/import/column-mapping";
import { classifyBankRows, type RawBankRowInput, type ClassifiedBankRow } from "@/lib/import/classify-bank-row";
import { chunkedInsert } from "@/lib/import/chunked-insert";
import { runMappingOnRows } from "@/lib/mapping/run-mapping";
import { toSen } from "@/lib/money";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const PREVIEW_SAMPLE_SIZE = 50;

export interface BankImportPreview {
  headers: string[];
  missingRequired: string[];
  summary: ReturnType<typeof classifyBankRows>["summary"];
  sample: ClassifiedBankRow[];
}

function mappingOverridesFromForm(formData: FormData): Record<string, string | null> {
  return {
    bank: formData.get("map_bank") as string | null,
    date: formData.get("map_date") as string | null,
    unit: formData.get("map_unit") as string | null,
    classification: formData.get("map_classification") as string | null,
    description: formData.get("map_description") as string | null,
    debit: formData.get("map_debit") as string | null,
    credit: formData.get("map_credit") as string | null,
    balance: formData.get("map_balance") as string | null,
    externalRef: formData.get("map_external_ref") as string | null,
  };
}

async function parseAndClassify(formData: FormData, supabase: SupabaseClient<Database>, entityId: string) {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Pilih file CSV atau Excel terlebih dahulu.");

  const isCsv = file.name.toLowerCase().endsWith(".csv");
  const bytes = Buffer.from(await file.arrayBuffer());
  const { headers, rows } = parseSpreadsheet(bytes, { isCsv });

  const overrides = mappingOverridesFromForm(formData);
  const mapping = resolveColumnMapping(headers, BANK_EXPENSE_MAPPING, overrides);
  if (mapping.missingRequired.length > 0) {
    return { headers, mapping, rawRows: [] as RawBankRowInput[], file, isCsv };
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

  const { data: banks } = await supabase.from("banks").select("id, bank_name").eq("entity_id", entityId);

  return { headers, mapping, rawRows, file, isCsv, banks: banks ?? [] };
}

async function fetchExistingDedupeKeys(supabase: SupabaseClient<Database>, keys: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const { data } = await supabase.from("bank_transactions_raw").select("dedupe_key").in("dedupe_key", chunk);
    for (const row of data ?? []) if (row.dedupe_key) existing.add(row.dedupe_key);
  }
  return existing;
}

/** Pure preview — classifies every row but writes nothing to the
 * database (spec M: never commit a manual file upload without a
 * preview step the user can still cancel). */
export async function previewBankExpenseImport(formData: FormData): Promise<BankImportPreview> {
  const supabase = await createClient();
  const entityId = formData.get("entity_id") as string;
  if (!entityId) throw new Error("Pilih entitas terlebih dahulu.");

  const { headers, mapping, rawRows, banks } = await parseAndClassify(formData, supabase, entityId);
  if (mapping.missingRequired.length > 0) {
    return { headers, missingRequired: mapping.missingRequired, summary: emptySummary(rawRows.length), sample: [] };
  }

  const draftKeys = classifyBankRows({ source: "csv_upload", rows: rawRows, banks: banks!, existingDedupeKeys: new Set() });
  const existingDedupeKeys = await fetchExistingDedupeKeys(
    supabase,
    draftKeys.rows.map((r) => r.dedupeKey)
  );
  const result = classifyBankRows({ source: "csv_upload", rows: rawRows, banks: banks!, existingDedupeKeys });

  return {
    headers,
    missingRequired: [],
    summary: result.summary,
    sample: result.rows.slice(0, PREVIEW_SAMPLE_SIZE),
  };
}

function emptySummary(totalRows: number) {
  return {
    totalRows,
    expenseCandidates: 0,
    debitOnlyIgnored: 0,
    bankNotFound: 0,
    invalidDate: 0,
    invalidAmount: 0,
    malformedRow: 0,
    duplicateExact: 0,
    duplicateSuspected: 0,
  };
}

const EXCEPTION_TYPE_FOR_STATUS: Partial<Record<ClassifiedBankRow["status"], Database["public"]["Enums"]["exception_type"]>> = {
  bank_not_found: "bank_not_found",
  invalid_amount: "invalid_amount",
  malformed_row: "malformed_data",
  duplicate_suspected: "duplicate_suspected",
};

/**
 * Re-parses and re-classifies from scratch (never trusts a client-
 * supplied preview result) and performs the actual writes: import_batches
 * row, chunked insert into bank_transactions_raw, exceptions for
 * flagged-but-inserted rows, import_row_errors for rows that had no
 * valid date to store at all. Idempotent by construction — re-running
 * this on the same file recomputes the same dedupe keys and finds them
 * already in bank_transactions_raw, so every row lands as
 * duplicate_exact (skipped) the second time.
 */
export async function commitBankExpenseImport(formData: FormData): Promise<{ batchId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi berakhir, silakan login kembali.");

  const entityId = formData.get("entity_id") as string;
  if (!entityId) throw new Error("Pilih entitas terlebih dahulu.");

  const { rawRows, banks, file, isCsv } = await parseAndClassify(formData, supabase, entityId);
  const draftKeys = classifyBankRows({ source: "csv_upload", rows: rawRows, banks: banks!, existingDedupeKeys: new Set() });
  const existingDedupeKeys = await fetchExistingDedupeKeys(
    supabase,
    draftKeys.rows.map((r) => r.dedupeKey)
  );
  const result = classifyBankRows({ source: "csv_upload", rows: rawRows, banks: banks!, existingDedupeKeys });

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
    "bank_transactions_raw",
    toInsert.map((r) => ({
      import_batch_id: batchId,
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
      exception_status: EXCEPTION_TYPE_FOR_STATUS[r.status] ? ("open" as const) : null,
    }))
  );

  const exceptionRows = toInsert
    .map((r, i) => ({ row: r, id: insertedIds[i]?.id }))
    .filter(({ row }) => EXCEPTION_TYPE_FOR_STATUS[row.status])
    .map(({ row, id }) => ({
      source_table: "bank_transactions_raw" as const,
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

  const hasErrors = result.summary.invalidDate + result.summary.invalidAmount + result.summary.malformedRow + result.summary.bankNotFound > 0;
  await supabase
    .from("import_batches")
    .update({
      status: hasErrors ? "completed_with_errors" : "completed",
      completed_at: new Date().toISOString(),
      valid_rows: result.summary.expenseCandidates + result.summary.debitOnlyIgnored,
      duplicate_count: result.summary.duplicateExact,
      skipped_rows: result.summary.duplicateSuspected,
      error_count:
        result.summary.invalidDate + result.summary.invalidAmount + result.summary.malformedRow + result.summary.bankNotFound,
    })
    .eq("id", batchId);

  await logAudit(supabase, {
    userId: user.id,
    action: "bank_expense_import_committed",
    entityTable: "import_batches",
    entityId: batchId,
    newValue: result.summary,
  });

  // Phase 4: run the Mapping Engine immediately on the rows that were
  // actually just inserted as expense candidates — never on
  // bank_not_found/debit_only/malformed/duplicate rows, which already
  // carry their own Phase 3 exception (or none) and need a corrected
  // re-import or human review, not an outlet/COA rule. This is the
  // "post_import" mapping run distinct from the manual Reprocess Engine
  // (app/mapping/actions.ts), which re-runs the identical function
  // against whatever is still open after rules change.
  const mappableRows = toInsert
    .map((r, i) => ({ id: insertedIds[i]?.id, row: r }))
    .filter((x): x is { id: string; row: (typeof toInsert)[number] } => !!x.id && x.row.status === "expense_candidate")
    .map(({ id, row }) => ({
      id,
      bankId: row.bankId,
      unitRaw: row.unit,
      classificationRaw: row.classification,
      descriptionRaw: row.description,
      debitSen: toSen(row.debit),
      creditSen: toSen(row.credit),
      detectedOutletId: null,
    }));

  if (mappableRows.length > 0) {
    const runStartedAt = new Date().toISOString();
    const counters = await runMappingOnRows(supabase, mappableRows, user.id);
    await supabase.from("mapping_runs").insert({
      scope: "batch",
      scope_id: batchId,
      triggered_by: user.id,
      trigger: "post_import",
      started_at: runStartedAt,
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
  }

  return { batchId };
}
