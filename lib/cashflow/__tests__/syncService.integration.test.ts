import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FakeSupabase } from "./fakeSupabase";
import { runGoogleSheetSync } from "../syncService";

/**
 * End-to-end test of the REAL sync pipeline (lib/cashflow/syncService.ts,
 * unmodified) against a synthetic sheet shaped like the documented
 * production structure: Bank/Rekening, Tanggal, Unit, Klasifikasi,
 * Deskripsi, Debit, Kredit, Saldo — Indonesian number/date formats
 * included. The actual "BUKU BANK AGUSTUS 2026 - Master-2.csv" was not
 * reachable in this sandbox (no Google credentials, and egress to
 * docs.google.com is blocked by the environment's network policy — see
 * CASHFLOW_VALIDATION_REPORT.md). This fixture is built to match the
 * documented column structure exactly; only the live values are
 * synthetic.
 *
 * Only the Google Sheets network call itself is stubbed (via the
 * dependency-injected `fetchRows`) — every other line of the sync engine
 * runs for real, against an in-memory Supabase-shaped store.
 */

function makeDb() {
  const db = new FakeSupabase();
  db.seed("bank_accounts", [
    { id: randomUUID(), account_code: "BCA_AMOR_1", account_name: "BCA AMOR 3722227", bank_name: "BCA", sheet_label: "BCA AMOR 3722227", opening_balance: "500000000.00", opening_balance_date: "2026-08-01", is_active: true, display_order: 1 },
    { id: randomUUID(), account_code: "BCA_IKI", account_name: "BCA IKI 343352", bank_name: "BCA", sheet_label: "BCA IKI 343352", opening_balance: "90000000.00", opening_balance_date: "2026-08-01", is_active: true, display_order: 2 },
  ]);
  db.seed("sync_config", [
    { key: "spreadsheet_id", value: "1D6Hh7LCC9L2nRwqEguc5JLM9kOUl9WyTY3o4v5gs_RQ" },
    { key: "sheet_name", value: "Master" },
    { key: "debit_credit_polarity", value: "debit_is_cash_out" },
  ]);
  db.seed("cashflow_transactions", []);
  db.seed("sync_errors", []);
  db.seed("sync_batches", []);
  db.seed("account_balance_snapshots", []);
  db.seed("internal_transfers", []);
  db.seed("alert_rules", []);
  db.seed("cashflow_alerts", []);
  db.seed("planned_cashflows", []);
  db.seed("payment_schedules", []);

  // JS re-implementation of supabase/migrations/0014's fn_rebuild_balance_snapshots,
  // faithful enough to exercise the reconciliation logic the sync pipeline depends on.
  db.rpcHandlers["fn_rebuild_balance_snapshots"] = (args) => {
    const accountId = args.p_bank_account_id as string;
    const account = db.tables.bank_accounts!.find((a) => a.id === accountId);
    if (!account) return null;
    const txns = db.tables.cashflow_transactions!.filter((t) => t.bank_account_id === accountId);
    const byDate = new Map<string, { cashIn: number; cashOut: number; sourceBalance: number | null }>();
    for (const t of txns.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
      const date = t.transaction_date as string;
      const entry = byDate.get(date) ?? { cashIn: 0, cashOut: 0, sourceBalance: null };
      entry.cashIn += Number(t.cash_in);
      entry.cashOut += Number(t.cash_out);
      if (t.source_balance !== null && t.source_balance !== undefined) entry.sourceBalance = Number(t.source_balance);
      byDate.set(date, entry);
    }
    let running = Number(account.opening_balance);
    const dates = Array.from(byDate.keys()).sort();
    const snapshots = db.tables.account_balance_snapshots!;
    for (const date of dates) {
      const d = byDate.get(date)!;
      const opening = running;
      const closing = opening + d.cashIn - d.cashOut;
      running = closing;
      const reconciliation = d.sourceBalance === null || Math.abs(d.sourceBalance - closing) < 0.01 ? "MATCHED" : "DIFFERENCE";
      const existingIdx = snapshots.findIndex((s) => s.bank_account_id === accountId && s.snapshot_date === date);
      const row = { bank_account_id: accountId, snapshot_date: date, opening_balance: opening, cash_in: d.cashIn, cash_out: d.cashOut, closing_balance: closing, source_balance: d.sourceBalance, reconciliation_status: reconciliation };
      if (existingIdx >= 0) snapshots[existingIdx] = { ...snapshots[existingIdx], ...row };
      else snapshots.push({ id: randomUUID(), ...row });
    }
    return null;
  };

  return db;
}

/** Header row + data rows shaped exactly like the documented "BUKU BANK" structure. */
function buildSyntheticSheet(): string[][] {
  const header = ["Tanggal", "Bank / Rekening", "Unit", "Klasifikasi", "Deskripsi", "Debit", "Kredit", "Saldo"];
  const rows: string[][] = [
    header,
    // Normal CASH_IN on a known account (Kredit filled) — Indonesian thousands/decimal format.
    ["05/08/2026", "BCA AMOR 3722227", "HO", "Penjualan", "Setoran tunai outlet", "", "50.000.000,00", "550.000.000,00"],
    // Normal CASH_OUT on the same account (Debit filled).
    ["06/08/2026", "BCA AMOR 3722227", "HO", "Operasional", "Bayar listrik & air", "5.000.000,00", "", "545.000.000,00"],
    // Known second account.
    ["05/08/2026", "BCA IKI 343352", "Outlet IKI", "Supplier", "Bayar bahan baku", "12.500.000", "", "77.500.000"],
    // A brand-new, previously-unseen account — first row is a "Saldo Awal" line (no debit/kredit, only Saldo).
    ["01/08/2026", "BCA KCRI 3525111", "", "", "Saldo Awal", "", "", "60.000.000"],
    // Same new account, now a real transaction — should use the opening balance captured above.
    ["07/08/2026", "BCA KCRI 3525111", "Outlet KCRI", "Penjualan", "Setoran harian", "", "8.000.000", "68.000.000"],
    // Ambiguous row: both Debit and Kredit filled — must be flagged, not guessed.
    ["08/08/2026", "BCA AMOR 3722227", "HO", "Lain-lain", "Koreksi entri ganda", "1.000.000", "1.000.000", "545.000.000"],
    // Invalid date — must be flagged, not silently dropped.
    ["31/13/2026", "BCA AMOR 3722227", "HO", "Operasional", "Tanggal salah ketik", "2.000.000", "", ""],
    // Truly blank movement row (subtotal/divider line) — silently skipped, not an error.
    ["09/08/2026", "BCA AMOR 3722227", "HO", "", "", "", "", "543.000.000"],
    // Missing bank column entirely — must be flagged.
    ["10/08/2026", "", "HO", "Operasional", "Baris tanpa rekening", "500.000", "", ""],
  ];
  return rows;
}

test("sync pipeline: maps the documented BUKU BANK column structure and applies the default Debit=CashOut/Kredit=CashIn polarity", async () => {
  const db = makeDb();
  const sheet = buildSyntheticSheet();

  const result = await runGoogleSheetSync(
    db as unknown as Parameters<typeof runGoogleSheetSync>[0],
    { triggeredBy: null, triggerType: "manual" },
    { fetchRows: async () => sheet }
  );

  assert.equal(result.status, "partial", "3 genuinely bad rows exist, so the batch should be 'partial', not 'failed' or silently 'completed'");
  assert.equal(result.rowsImported, 4, "4 valid transaction rows: 2 on BCA AMOR, 1 on BCA IKI, 1 new-account txn — the Saldo Awal row is NOT itself a transaction");
  assert.equal(result.rowsError, 3, "both-debit-credit, invalid-date, and missing-bank rows must all be routed to sync_errors");

  const txns = db.tables.cashflow_transactions!;
  assert.equal(txns.length, 4);

  const amorIn = txns.find((t) => t.description === "Setoran tunai outlet");
  assert.ok(amorIn, "the Kredit-only row must produce a transaction");
  assert.equal(amorIn!.transaction_type, "CASH_IN");
  assert.equal(Number(amorIn!.cash_in), 50_000_000);
  assert.equal(Number(amorIn!.cash_out), 0);

  const amorOut = txns.find((t) => t.description === "Bayar listrik & air");
  assert.equal(amorOut!.transaction_type, "CASH_OUT", "Debit column must map to CASH_OUT under the default polarity");
  assert.equal(Number(amorOut!.cash_out), 5_000_000);

  // Data quality: nothing is silently dropped. "unknown_account" is an
  // informational entry (the new BCA KCRI account being onboarded), not a
  // data-quality failure — it's still logged so Finance can review it.
  const errors = db.tables.sync_errors!;
  const errorTypes = errors.map((e) => e.issue_type).sort();
  assert.deepEqual(errorTypes, ["account_mapping_missing", "both_debit_credit_filled", "invalid_date", "unknown_account"].sort());

  // RULE 7: opening balance for a brand-new account comes from its OWN
  // first "no debit, no kredit, saldo only" row — never from 0, never from
  // a combined sheet-wide saldo.
  const kcri = db.tables.bank_accounts!.find((a) => a.account_name === "BCA KCRI 3525111");
  assert.ok(kcri, "an unrecognized account must be auto-onboarded, not rejected");
  assert.equal(Number(kcri!.opening_balance), 60_000_000, "opening balance must come from the account's own Saldo Awal row (60jt), not default to 0");
  assert.equal(kcri!.opening_balance_date, "2026-08-01");

  // That account's real transaction afterwards must reconcile against its
  // own opening balance (60jt + 8jt in = 68jt), matching the sheet's Saldo column.
  const kcriSnapshot = db.tables.account_balance_snapshots!.find((s) => s.bank_account_id === kcri!.id && s.snapshot_date === "2026-08-07");
  assert.ok(kcriSnapshot);
  assert.equal(kcriSnapshot!.closing_balance, 68_000_000);
  assert.equal(kcriSnapshot!.reconciliation_status, "MATCHED");
});

test("sync pipeline: re-syncing the identical sheet is idempotent (RULE 5 — no duplicate transactions)", async () => {
  const db = makeDb();
  const sheet = buildSyntheticSheet();
  const fetchRows = async () => sheet;

  const first = await runGoogleSheetSync(db as unknown as Parameters<typeof runGoogleSheetSync>[0], { triggeredBy: null, triggerType: "manual" }, { fetchRows });
  const countAfterFirst = db.tables.cashflow_transactions!.length;
  assert.equal(first.rowsImported, 4);
  assert.equal(countAfterFirst, 4);

  const second = await runGoogleSheetSync(db as unknown as Parameters<typeof runGoogleSheetSync>[0], { triggeredBy: null, triggerType: "manual" }, { fetchRows });
  const countAfterSecond = db.tables.cashflow_transactions!.length;

  assert.equal(second.rowsImported, 0, "nothing should be re-imported as new on the second identical sync");
  // 4 unchanged transactions recognized as duplicates + the 2 blank/no-movement
  // rows (Saldo Awal line, subtotal divider) skipped again — neither creates a row.
  assert.equal(second.rowsSkipped, 6);
  assert.equal(countAfterSecond, countAfterFirst, "row count must be identical after syncing the exact same sheet twice — RULE 5");
});

test("sync pipeline: a corrected value in the sheet is picked up as an update, not a duplicate", async () => {
  const db = makeDb();
  const sheet = buildSyntheticSheet();
  await runGoogleSheetSync(db as unknown as Parameters<typeof runGoogleSheetSync>[0], { triggeredBy: null, triggerType: "manual" }, { fetchRows: async () => sheet });

  // Finance corrects the Klasifikasi for one row after the first sync (same
  // fingerprint-relevant fields — date/account/amount/description — unchanged).
  const corrected = sheet.map((row) => (row[4] === "Setoran tunai outlet" ? [...row.slice(0, 3), "Penjualan Retail", ...row.slice(4)] : row));

  const second = await runGoogleSheetSync(
    db as unknown as Parameters<typeof runGoogleSheetSync>[0],
    { triggeredBy: null, triggerType: "manual" },
    { fetchRows: async () => corrected }
  );

  assert.equal(second.rowsImported, 0);
  assert.equal(second.rowsUpdated, 1, "the row with a corrected Klasifikasi must count as an update, not a new row or a silent skip");
  assert.equal(db.tables.cashflow_transactions!.length, 4, "still exactly 4 transactions — the correction must not create a 5th");
});

test("sync pipeline: never assumes Debit/Kredit polarity silently — a wrong polarity configuration is caught and flagged", async () => {
  const db = makeDb();
  // Deliberately set the WRONG polarity for this sheet (the sheet's Saldo
  // column, seeded below, is only consistent with the default
  // Debit=CashOut/Kredit=CashIn convention).
  db.tables.sync_config!.find((c) => c.key === "debit_credit_polarity")!.value = "debit_is_cash_in";

  const header = ["Tanggal", "Bank / Rekening", "Unit", "Klasifikasi", "Deskripsi", "Debit", "Kredit", "Saldo"];
  // BCA AMOR opens at 500jt (seeded in makeDb). Five Kredit-only deposits in
  // a row — under the correct polarity each is +10jt; the sheet's own Saldo
  // column reflects that. Under the wrong polarity the app would instead
  // subtract 10jt each day, diverging from Saldo every single day.
  const rows: string[][] = [header];
  let runningBalance = 500_000_000;
  for (let day = 1; day <= 5; day++) {
    runningBalance += 10_000_000;
    rows.push([`0${day}/08/2026`, "BCA AMOR 3722227", "HO", "Penjualan", `Setoran hari ke-${day}`, "", "10.000.000", String(runningBalance)]);
  }

  const result = await runGoogleSheetSync(db as unknown as Parameters<typeof runGoogleSheetSync>[0], { triggeredBy: null, triggerType: "manual" }, { fetchRows: async () => rows });

  assert.equal(result.rowsImported, 5);

  const mismatchError = db.tables.sync_errors!.find((e) => e.issue_type === "running_balance_mismatch");
  assert.ok(mismatchError, "a systematic Saldo mismatch across multiple days must raise a dedicated running_balance_mismatch issue, not just quietly accumulate 5 separate daily differences");
  assert.match(mismatchError!.message as string, /polaritas/i);
});
