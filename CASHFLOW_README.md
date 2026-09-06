# Cashflow Management System (cf.amorgroup.id)

Phase 1 (Foundation) + Phase 2 (Core Dashboard) of the Cashflow Management
System, built as an independent module inside the existing
`partnership-finance-system` repo. It shares the existing Next.js/Supabase
foundation (auth, RLS pattern, Tailwind theme) but has **no dependency on
the accounting domain** (no COA, journal, P&L, investor/ownership) — see
"Why a separate module" below.

## What's included (Phase 1 + 2, functional)

- **Schema**: `supabase/migrations/0010`–`0015` — `bank_accounts`,
  `cashflow_categories`, `sync_config`, `sync_batches`, `cashflow_transactions`,
  `sync_errors`, `internal_transfers`, `planned_cashflows`, `payment_schedules`,
  `account_balance_snapshots`, `alert_rules`, `cashflow_alerts`, RLS policies,
  and the running-balance / snapshot-rebuild SQL functions.
- **Google Sheet sync** (`lib/cashflow/*`): column-alias mapping layer
  (`columnMapping.ts`), defensive parsing of Indonesian number/date formats
  (`parse.ts`), idempotent fingerprint-based upsert (`fingerprint.ts`,
  `syncService.ts`), internal-transfer suggestion (`transferMatcher.ts`),
  alert evaluation (`alerts.ts`). Triggered manually from
  Settings → Google Sheet Sync ("Sync Now"), or unattended via
  `POST /api/cashflow/cron-sync` (bearer-token protected, for an external
  cron).
- **Dashboard** (`/cashflow/dashboard`): consolidated KPIs, cash position
  chart, per-account balance cards, open alerts.
- **Accounts** (`/cashflow/accounts`, `/cashflow/accounts/[id]`): per-account
  balance, running-balance chart, filterable/paginated transactions.
- **Transactions** (`/cashflow/transactions`): global filterable/paginated
  table + CSV export.
- **Settings**: Bank Accounts, Categories, Google Sheet Sync (config + Sync
  Now + sync log + Sync Issues review), Alert Thresholds.
- **Phase 3–5 schema is in place** and given minimal-but-functional CRUD UI
  so the nav is complete end to end: Cashflow Plan, Payment Schedule,
  Calendar, Reports (Consolidated / Per Account / Per Category / Internal
  Transfer confirmation / Reconciliation).

## Why a separate module, not an extension of the existing accounting app

This repository's existing code (`0001`–`0008`, `app/master-data/*`) is a
**partnership accounting system**: chart of accounts, journal/GL with a
posting workflow, P&L publishing, investor ownership and profit
distribution. The Cashflow Management System brief explicitly excludes all
of that (no COA, no journal, no P&L, no investor/profit-sharing). Rather
than bolt cashflow concepts onto tables built for a different purpose (or
rip out working accounting code to make room), this module:

- adds new tables (`bank_accounts`, `cashflow_transactions`, ...) that do
  not reference `coa`, `journal_headers`, `investors`, etc.,
- reuses only the technical foundation: Supabase Postgres, the
  `profiles`/`user_role` auth model (`finance_manager`/`management` are
  exactly this system's target users), RLS pattern, Tailwind theme, and
  `lib/money.ts`'s Rupiah-safe arithmetic,
- leaves every existing accounting table, page, and RLS policy untouched.

`finance_manager` and `management` now land on `/cashflow/dashboard` after
login (their old `/finance` and `/management` placeholder pages still exist
and link back in, for the accounting side once it's built out further).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project + Google service account
supabase link --project-ref <ref>
supabase db push             # or: supabase db reset (local, includes seed.sql)
npm run db:types             # overwrite types/database.types.ts with the real generated types
npm run dev
```

### Google Sheet credential setup

1. In Google Cloud Console, create (or reuse) a project, enable the
   **Google Sheets API**, and create a **Service Account**.
2. Create a JSON key for that service account and copy `client_email` and
   `private_key` into `GOOGLE_SERVICE_ACCOUNT_EMAIL` /
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (keep the `\n` escapes literal).
3. Open the target spreadsheet and **share it with the service account's
   email** (Viewer is enough — the app only reads).
4. In the app, go to Settings → Google Sheet Sync and confirm the
   Spreadsheet ID and sheet/tab name (defaults to the ID from the spec and
   tab name "Master" — change if your sheet uses a different tab).
5. Click **Sync Now**.

### Cron (scheduled sync)

`POST /api/cashflow/cron-sync` with header `Authorization: Bearer
$CRON_SECRET`. Wire this into Vercel Cron, a GitHub Actions schedule, or a
plain `crontab` entry with `curl`, at whatever interval matches how often
Finance updates the sheet (hourly is a reasonable default).

## Documented assumptions (spec was ambiguous or silent)

- **Debit/Kredit polarity**: defaults to *Debit = Cash Out, Kredit = Cash
  In* (the standard Indonesian bank-book convention, matching "BUKU BANK").
  Configurable per spreadsheet in Settings → Google Sheet Sync without a
  redeploy (`sync_config.debit_credit_polarity`).
- **Fingerprint** includes `source_row_id` (as the spec's own example
  does): `sheet + row + date + account + cash_in + cash_out + description`.
  This means a row that gets manually reordered in the sheet, with no
  content change, will sync as a "new" transaction rather than being
  recognized as the same one — a known tradeoff favoring not conflating two
  legitimately identical transactions on the same day (see spec's own
  fingerprint example). Revisit if reordering turns out to be common.
- **Unrecognized "Bank/Rekening" values are auto-onboarded** as a new
  `bank_accounts` row (opening balance 0) rather than rejected, so "semua
  rekening teridentifikasi" holds after the first sync — and logged to Sync
  Issues (`unknown_account`) so Finance can fill in the real opening
  balance and confirm the identity (is it really a new account, or a typo
  variant of an existing one?).
- **Internal transfer matching never auto-confirms**, regardless of
  confidence — it only ever creates a `suggested` row in `internal_transfers`
  for a human to confirm or reject (Reports → Internal Transfers). Only a
  confirmed transfer flips both legs' `transaction_type` to
  `INTERNAL_TRANSFER_IN`/`OUT` and excludes them from the consolidated
  external Cash In/Cash Out KPIs.
- **Consolidated aggregation is done server-side in the Server Component**
  (bounded by date range, narrow column selection), not via a dedicated
  Postgres aggregate RPC. This is fine at the volumes expected in the first
  iteration; if history grows into the tens of thousands of rows per
  account, replace `lib/cashflow/queries.ts`'s `sumTransactionsInRange`
  with a `sum()`/`count()` RPC of the same shape.
- Cashflow module access is `super_admin` (full), `finance_manager` (full),
  `management` (read-only) — `accounting`/`investor` roles have no RLS
  policy on these tables (denied by default), matching "cashflow is not
  accounting."

## Known limitations / not yet built

- Recurring `planned_cashflows` (`recurrence_rule`) stores the rule but
  does not yet auto-generate future occurrences.
- PDF export is not implemented (CSV is); the spec marks PDF optional.
- The internal-transfer matcher scopes its candidate search to the most
  recent 500 unmatched rows on each side — fine for ongoing sync, but a
  very large backfill may need a wider window or a batched re-run.
- No live end-to-end test against a real Supabase project or real Google
  Sheet was possible in this environment (no provisioned Supabase project,
  no Google service account credentials were provided) — see "Test
  results" below for what *was* verified.
