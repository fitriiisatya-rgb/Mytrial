import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { fetchSheetRows } from "./googleSheets";
import { resolveColumnMap, getCell } from "./columnMapping";
import { parseSheetAmount, parseSheetDate } from "./parse";
import { buildSourceFingerprint } from "./fingerprint";
import { suggestInternalTransfers } from "./transferMatcher";
import { evaluateAlerts } from "./alerts";

type DB = SupabaseClient<Database>;

/** Injected in tests so the full sync pipeline can run against a synthetic sheet without a live Google API call. Defaults to the real fetch in production. */
export type SheetFetcher = (spreadsheetId: string, sheetName: string) => Promise<string[][]>;

export interface SyncResult {
  batchId: string;
  status: "completed" | "failed" | "partial";
  rowsRead: number;
  rowsImported: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsError: number;
  errorMessage?: string;
}

interface ValidRow {
  bankAccountId: string;
  transactionDate: string;
  unit: string | null;
  classification: string | null;
  description: string;
  cashIn: number;
  cashOut: number;
  sourceBalance: number | null;
  sourceRowId: string;
  fingerprint: string;
}

function slugCode(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

async function loadSyncConfig(supabase: DB) {
  const { data } = await supabase.from("sync_config").select("key, value");
  const map = new Map<string, unknown>((data ?? []).map((r) => [r.key, r.value]));
  return {
    spreadsheetId: (map.get("spreadsheet_id") as string) ?? process.env.CASHFLOW_SPREADSHEET_ID ?? "",
    sheetName: (map.get("sheet_name") as string) ?? "Master",
    debitIsCashOut: (map.get("debit_credit_polarity") as string) !== "debit_is_cash_in",
  };
}

/** Chunk an array — Postgres/PostgREST `.in()` filters get unwieldy past a few hundred values. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * "Jangan assume debit/kredit polarity secara diam-diam" — the app defaults
 * to a documented convention (Debit = Cash Out, Kredit = Cash In) but never
 * trusts it blindly. After every sync, this compares the freshly rebuilt
 * calculated balance against the spreadsheet's own Saldo column for the
 * accounts just touched. A LOW isolated mismatch is normal data noise
 * (rounding, a manually corrected row) and is already surfaced per-day via
 * RECONCILIATION_DIFFERENCE alerts. A HIGH mismatch rate across an account's
 * recent history is a different, more urgent signal — it usually means the
 * polarity is inverted for that sheet — so it gets its own, louder sync
 * issue instead of being lost among ordinary daily differences.
 */
async function checkPolarityConsistency(supabase: DB, batchId: string, sheetName: string, touchedAccountIds: string[]): Promise<void> {
  for (const accountId of touchedAccountIds) {
    const { data: snapshots } = await supabase
      .from("account_balance_snapshots")
      .select("reconciliation_status, source_balance")
      .eq("bank_account_id", accountId)
      .not("source_balance", "is", null)
      .order("snapshot_date", { ascending: false })
      .limit(30);

    const checkable = snapshots ?? [];
    if (checkable.length < 3) continue; // not enough source-balance data points to judge polarity

    const differenceCount = checkable.filter((s) => s.reconciliation_status === "DIFFERENCE").length;
    const ratio = differenceCount / checkable.length;
    if (ratio > 0.5) {
      const { data: account } = await supabase.from("bank_accounts").select("account_name").eq("id", accountId).maybeSingle();
      await supabase.from("sync_errors").insert({
        sync_batch_id: batchId,
        source_sheet: sheetName,
        issue_type: "running_balance_mismatch",
        message: `Saldo kalkulasi berbeda dari saldo spreadsheet pada ${differenceCount}/${checkable.length} hari terakhir untuk rekening "${account?.account_name ?? accountId}". Ini sering berarti polaritas Debit/Kredit terbalik untuk sheet ini — periksa Settings > Google Sheet Sync.`,
      });
    }
  }
}

export async function runGoogleSheetSync(
  supabase: DB,
  opts: { triggeredBy: string | null; triggerType: "manual" | "cron" },
  deps: { fetchRows?: SheetFetcher } = {}
): Promise<SyncResult> {
  const fetchRows = deps.fetchRows ?? fetchSheetRows;
  const config = await loadSyncConfig(supabase);

  const { data: batch, error: batchError } = await supabase
    .from("sync_batches")
    .insert({
      source_spreadsheet_id: config.spreadsheetId,
      source_sheet_name: config.sheetName,
      status: "running",
      triggered_by: opts.triggeredBy,
      trigger_type: opts.triggerType,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(`runGoogleSheetSync: failed to create sync_batches row: ${batchError?.message}`);
  }
  const batchId = batch.id;

  const fail = async (message: string): Promise<SyncResult> => {
    await supabase
      .from("sync_batches")
      .update({ status: "failed", finished_at: new Date().toISOString(), error_message: message })
      .eq("id", batchId);
    return { batchId, status: "failed", rowsRead: 0, rowsImported: 0, rowsUpdated: 0, rowsSkipped: 0, rowsError: 0, errorMessage: message };
  };

  let rows: string[][];
  try {
    rows = await fetchRows(config.spreadsheetId, config.sheetName);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Failed to fetch Google Sheet");
  }

  if (rows.length < 2) {
    return fail("Sheet has no data rows below the header");
  }

  const headerRow = rows[0]!;
  const dataRows = rows.slice(1);
  const map = resolveColumnMap(headerRow);

  if (map.index.bank < 0 || map.index.date < 0 || (map.index.debit < 0 && map.index.kredit < 0)) {
    return fail(
      `Could not map required columns from header row: ${headerRow.join(", ")}. Need at least Bank/Rekening, Tanggal, and Debit/Kredit.`
    );
  }

  const { data: bankAccounts } = await supabase
    .from("bank_accounts")
    .select("id, account_name, sheet_label");
  const bankByLabel = new Map<string, string>();
  for (const b of bankAccounts ?? []) {
    if (b.sheet_label) bankByLabel.set(b.sheet_label.trim().toLowerCase(), b.id);
    bankByLabel.set(b.account_name.trim().toLowerCase(), b.id);
  }

  const validRows: ValidRow[] = [];
  const errorRows: Database["public"]["Tables"]["sync_errors"]["Insert"][] = [];
  let rowsRead = 0;
  let rowsSkippedBlank = 0;
  // RULE (opening balance): a brand-new account's opening balance must come
  // from ITS OWN first "no debit, no kredit, saldo only" row (a typical
  // "Saldo Awal" line in a buku bank sheet) — never from a combined/gabungan
  // running saldo, and never overwritten once set. Scoped to accounts
  // created by *this* sync run so an existing, manually-configured opening
  // balance is never touched by a later blank row elsewhere in the sheet.
  const newlyCreatedAccounts = new Set<string>();
  const openingCandidates = new Map<string, { balance: number; date: string }>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const sourceRowId = String(i + 2); // +1 for 0-index, +1 for header row
    if (row.every((c) => c.trim() === "")) continue; // truly blank line, not even worth counting
    rowsRead++;

    const bankRaw = getCell(row, map, "bank");
    const dateRaw = getCell(row, map, "date");
    const debitRaw = getCell(row, map, "debit");
    const kreditRaw = getCell(row, map, "kredit");
    const saldoRaw = getCell(row, map, "saldo");
    const description = getCell(row, map, "description") ?? "";
    const unit = getCell(row, map, "unit") ?? null;
    const classification = getCell(row, map, "classification") ?? null;

    if (!bankRaw) {
      errorRows.push({ sync_batch_id: batchId, source_sheet: config.sheetName, source_row_id: sourceRowId, raw_data: { row }, issue_type: "account_mapping_missing", message: "Kolom Bank/Rekening kosong" });
      continue;
    }

    let bankAccountId = bankByLabel.get(bankRaw.trim().toLowerCase());
    if (!bankAccountId) {
      // RULE: don't silently drop an unrecognized account — onboard it so
      // "Semua rekening teridentifikasi" holds, but flag it for review too
      // (opening balance defaults to 0 and needs a human to confirm it).
      const code = slugCode(bankRaw) || `ACC_${Date.now()}`;
      const { data: created, error: createErr } = await supabase
        .from("bank_accounts")
        .insert({ account_code: code, account_name: bankRaw.trim(), bank_name: bankRaw.trim().split(/\s+/)[0] ?? bankRaw.trim(), sheet_label: bankRaw.trim(), opening_balance: "0" })
        .select("id")
        .single();
      if (createErr || !created) {
        errorRows.push({ sync_batch_id: batchId, source_sheet: config.sheetName, source_row_id: sourceRowId, raw_data: { row }, issue_type: "unknown_account", message: `Rekening "${bankRaw}" tidak dikenal dan gagal dibuat otomatis: ${createErr?.message}` });
        continue;
      }
      bankAccountId = created.id;
      bankByLabel.set(bankRaw.trim().toLowerCase(), bankAccountId);
      newlyCreatedAccounts.add(bankAccountId);
      errorRows.push({ sync_batch_id: batchId, source_sheet: config.sheetName, source_row_id: sourceRowId, raw_data: { row }, issue_type: "unknown_account", message: `Rekening baru "${bankRaw}" otomatis dibuat — mohon lengkapi opening balance di Settings > Rekening Bank.`, status: "open" });
    }

    const transactionDate = parseSheetDate(dateRaw);
    if (!transactionDate) {
      errorRows.push({ sync_batch_id: batchId, source_sheet: config.sheetName, source_row_id: sourceRowId, raw_data: { row }, issue_type: "invalid_date", message: `Tanggal tidak valid: "${dateRaw ?? ""}"` });
      continue;
    }

    const debit = parseSheetAmount(debitRaw);
    const kredit = parseSheetAmount(kreditRaw);
    const sourceBalance = saldoRaw === undefined ? null : parseSheetAmount(saldoRaw);
    if (debit === null || kredit === null) {
      errorRows.push({ sync_batch_id: batchId, source_sheet: config.sheetName, source_row_id: sourceRowId, raw_data: { row }, issue_type: "invalid_amount", message: `Debit/Kredit tidak valid: "${debitRaw ?? ""}" / "${kreditRaw ?? ""}"` });
      continue;
    }
    if (debit > 0 && kredit > 0) {
      errorRows.push({ sync_batch_id: batchId, source_sheet: config.sheetName, source_row_id: sourceRowId, raw_data: { row }, issue_type: "both_debit_credit_filled", message: "Debit dan Kredit sama-sama terisi — baris ambigu, perlu review manual." });
      continue;
    }
    if (debit === 0 && kredit === 0) {
      rowsSkippedBlank++;
      // A "Saldo Awal"-style line (no movement, just a balance) for a
      // brand-new account, seen for the first time — this is where the
      // account's real opening balance comes from, per-account, not from
      // some sheet-wide combined saldo.
      if (newlyCreatedAccounts.has(bankAccountId) && sourceBalance !== null && !openingCandidates.has(bankAccountId)) {
        openingCandidates.set(bankAccountId, { balance: sourceBalance, date: transactionDate });
      }
      continue;
    }

    const cashIn = config.debitIsCashOut ? kredit : debit;
    const cashOut = config.debitIsCashOut ? debit : kredit;

    const fingerprint = buildSourceFingerprint({
      sourceSheet: config.sheetName,
      sourceRowId,
      transactionDate,
      bankAccountId,
      cashIn,
      cashOut,
      description,
    });

    validRows.push({
      bankAccountId, transactionDate, unit, classification, description,
      cashIn, cashOut, sourceBalance, sourceRowId, fingerprint,
    });
  }

  for (const [accountId, candidate] of openingCandidates) {
    await supabase
      .from("bank_accounts")
      .update({ opening_balance: String(candidate.balance), opening_balance_date: candidate.date })
      .eq("id", accountId);
  }

  // Look up which fingerprints already exist, so we can tell "brand new"
  // from "already synced, metadata refreshed" from "identical, no-op".
  const existingByFingerprint = new Map<
    string,
    { unit: string | null; classification: string | null; source_balance: string | null; description: string | null }
  >();
  for (const group of chunk(validRows.map((r) => r.fingerprint), 300)) {
    const { data } = await supabase
      .from("cashflow_transactions")
      .select("source_fingerprint, unit, classification, source_balance, description")
      .in("source_fingerprint", group);
    for (const row of data ?? []) {
      existingByFingerprint.set(row.source_fingerprint, {
        unit: row.unit, classification: row.classification, source_balance: row.source_balance, description: row.description,
      });
    }
  }

  let rowsImported = 0;
  let rowsUpdated = 0;
  let rowsSkipped = rowsSkippedBlank;
  const touchedAccounts = new Set<string>();

  for (const group of chunk(validRows, 300)) {
    const payload: Database["public"]["Tables"]["cashflow_transactions"]["Insert"][] = group.map((r) => ({
      transaction_date: r.transactionDate,
      bank_account_id: r.bankAccountId,
      description: r.description || null,
      unit: r.unit,
      classification: r.classification,
      transaction_type: r.cashIn > 0 ? "CASH_IN" : "CASH_OUT",
      cash_in: String(r.cashIn),
      cash_out: String(r.cashOut),
      source_balance: r.sourceBalance === null ? null : String(r.sourceBalance),
      source_type: "google_sheet",
      source_sheet: config.sheetName,
      source_row_id: r.sourceRowId,
      source_fingerprint: r.fingerprint,
      sync_batch_id: batchId,
    }));

    const { error: upsertError } = await supabase
      .from("cashflow_transactions")
      .upsert(payload, { onConflict: "source_fingerprint" });

    if (upsertError) {
      for (const r of group) {
        errorRows.push({ sync_batch_id: batchId, source_sheet: config.sheetName, source_row_id: r.sourceRowId, issue_type: "other", message: `Gagal menyimpan transaksi: ${upsertError.message}` });
      }
      continue;
    }

    for (const r of group) {
      touchedAccounts.add(r.bankAccountId);
      const existing = existingByFingerprint.get(r.fingerprint);
      if (!existing) {
        rowsImported++;
      } else if (
        existing.unit !== r.unit ||
        existing.classification !== r.classification ||
        Number(existing.source_balance ?? NaN) !== (r.sourceBalance ?? NaN) ||
        (existing.description ?? "") !== r.description
      ) {
        rowsUpdated++;
      } else {
        rowsSkipped++;
      }
    }
  }

  if (errorRows.length > 0) {
    for (const group of chunk(errorRows, 300)) {
      await supabase.from("sync_errors").insert(group);
    }
  }

  for (const accountId of touchedAccounts) {
    await supabase.rpc("fn_rebuild_balance_snapshots", { p_bank_account_id: accountId });
  }

  await checkPolarityConsistency(supabase, batchId, config.sheetName, Array.from(touchedAccounts));
  await suggestInternalTransfers(supabase, Array.from(touchedAccounts));
  await evaluateAlerts(supabase);

  const rowsError = errorRows.filter((e) => e.issue_type !== "unknown_account").length;
  const status = rowsError > 0 && rowsImported + rowsUpdated + rowsSkipped === 0 ? "failed" : rowsError > 0 ? "partial" : "completed";

  await supabase
    .from("sync_batches")
    .update({
      finished_at: new Date().toISOString(),
      status,
      rows_read: rowsRead,
      rows_imported: rowsImported,
      rows_updated: rowsUpdated,
      rows_skipped: rowsSkipped,
      rows_error: rowsError,
    })
    .eq("id", batchId);

  return { batchId, status, rowsRead, rowsImported, rowsUpdated, rowsSkipped, rowsError };
}
