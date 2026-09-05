-- =====================================================================
-- 0009 — TRANSACTION IMPORT: BATCH TRACKING, RAW PAYLOAD, SOURCE CONFIG
-- Phase 3. Purely additive — no existing Phase 1/2 table, column,
-- policy, or business rule is redefined. import_batches/
-- bank_transactions_raw/revenue_transactions_raw/exceptions/
-- revenue_sources already existed (0003/0004) with exactly the shape
-- Phase 3 needs for candidate-expense filtering (credit > 0, already
-- indexed), dedupe (dedupe_key, already unique), and per-row exception
-- tracking (exceptions table, already keyed by source_table/source_id)
-- — this migration only adds the batch-lifecycle bookkeeping and
-- full-fidelity raw payload columns the Phase 3 spec calls for that
-- didn't exist yet, plus one new exception_type label and a new,
-- self-contained source-config table for reusable column mappings and
-- Google Sheet sync bookkeeping.
-- =====================================================================

-- Batch lifecycle bookkeeping the spec's Import Batch section requires
-- that 0003's import_batches didn't carry: which entity the batch
-- belongs to, a human-readable source name, explicit start/finish
-- timestamps (imported_at already exists but only marks a single
-- point), and the valid/skipped counters alongside the existing
-- row_count/duplicate_count/error_count.
alter table import_batches
  add column entity_id uuid references entities(id),
  add column source_name text,
  add column started_at timestamptz,
  add column completed_at timestamptz,
  add column valid_rows integer not null default 0,
  add column skipped_rows integer not null default 0,
  add column checksum text;

comment on column import_batches.status is
  'Expected values: draft, processing, completed, completed_with_errors, failed. '
  'Kept as plain text (unchanged from 0003) rather than an enum so Phase 3 '
  'does not need a type migration to add a status later.';

-- Full-fidelity original row, so a re-parse/audit never depends on
-- reconstructing the source from the already-normalized columns.
alter table bank_transactions_raw add column raw_payload jsonb;
alter table revenue_transactions_raw add column raw_payload jsonb;

-- The existing exception_type enum already anticipated most of Phase
-- 3's per-row validation states (invalid_amount, invalid_date,
-- malformed_data, duplicate_suspected for bank rows; outlet_not_detected
-- reused for revenue rows with an unrecognized outlet) — only
-- "bank account not recognized" (Correction #1: a bank expense row must
-- resolve to a specific bank_accounts row, never a generic fallback)
-- had no label yet.
alter type exception_type add value if not exists 'bank_not_found';

-- =====================================================================
-- REUSABLE IMPORT SOURCE CONFIGURATION (CSV/Excel column mapping +
-- Google Sheet sync bookkeeping). New, self-contained table — nothing
-- in 0001-0008 referenced this concept, so there is nothing to migrate
-- away from.
-- =====================================================================
create table import_source_configs (
  id              uuid primary key default uuid_generate_v4(),
  entity_id       uuid not null references entities(id),
  source_type     import_source_type not null, -- csv_upload / excel_upload / google_sheet (0001)
  target          text not null check (target in ('bank_expense', 'revenue')),
  name            text not null,
  -- google_sheet only:
  spreadsheet_id  text,
  sheet_name      text,
  header_row      integer not null default 1,
  -- target = 'revenue' only: which clearing-account source (0003) this
  -- recurring sheet always represents, so Sync Now never has to ask.
  revenue_source_id uuid references revenue_sources(id),
  -- reusable column mapping: {"Bank": "bank", "Tanggal": "transaction_date", ...}
  -- keeps a user from re-mapping columns on every import of the same
  -- recurring source layout.
  column_mapping  jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  last_sync_at    timestamptz,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  unique (entity_id, name)
);
create index idx_import_source_configs_active on import_source_configs (active) where active;

alter table import_source_configs enable row level security;
-- Same staff set as import_batches (staff_rw_import_batches, 0008) —
-- source configuration is operational metadata for the same people who
-- run imports, never exposed to investors.
create policy staff_rw_import_source_configs on import_source_configs for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));

-- =====================================================================
-- ROW-LEVEL IMPORT ERRORS for rows that could never become a raw row at
-- all — chiefly an unparseable date, since bank_transactions_raw.txn_date
-- and revenue_transactions_raw.txn_date are NOT NULL DATE columns with no
-- sensible default. Every other validation problem (bad amount, unknown
-- bank/outlet, suspected duplicate) still produces a real raw row (numeric
-- columns default to 0, bank_id/outlet_id are nullable) that the existing
-- `exceptions` table (0004) tracks — this table exists only for the rows
-- that don't clear that bar, so "one bad row never fails the whole batch"
-- (spec) holds even for input broken enough to have no valid date.
-- =====================================================================
create table import_row_errors (
  id              uuid primary key default uuid_generate_v4(),
  import_batch_id uuid not null references import_batches(id) on delete cascade,
  row_number      integer not null,
  error_code      text not null,
  error_message   text not null,
  raw_payload     jsonb,
  created_at      timestamptz not null default now()
);
create index idx_import_row_errors_batch on import_row_errors (import_batch_id);

alter table import_row_errors enable row level security;
create policy staff_rw_import_row_errors on import_row_errors for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
