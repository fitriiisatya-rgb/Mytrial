-- =====================================================================
-- 0010 — CASHFLOW MODULE: SYNC LOG, TRANSACTIONS, INTERNAL TRANSFERS
-- =====================================================================

create table sync_batches (
  id                    uuid primary key default uuid_generate_v4(),
  source_type           text not null default 'google_sheet' check (source_type in ('google_sheet','manual')),
  source_spreadsheet_id text not null,
  source_sheet_name     text,
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  status                text not null default 'running' check (status in ('running','completed','failed','partial')),
  rows_read             integer not null default 0,
  rows_imported         integer not null default 0,   -- brand-new transactions inserted
  rows_updated          integer not null default 0,    -- existing fingerprint, values changed
  rows_skipped          integer not null default 0,    -- existing fingerprint, unchanged (dedupe working)
  rows_error            integer not null default 0,    -- routed to sync_errors instead of inserted
  triggered_by          uuid references profiles(id),
  trigger_type          text not null default 'manual' check (trigger_type in ('manual','cron')),
  error_message         text,
  created_at            timestamptz not null default now()
);
create index idx_sync_batches_started on sync_batches (started_at desc);

create table cashflow_transactions (
  id                    uuid primary key default uuid_generate_v4(),
  transaction_date      date not null,
  bank_account_id       uuid not null references bank_accounts(id),
  description           text,
  unit                  text,
  classification        text,
  category_id           uuid references cashflow_categories(id),
  transaction_type      text not null check (transaction_type in
                           ('CASH_IN','CASH_OUT','INTERNAL_TRANSFER_IN','INTERNAL_TRANSFER_OUT')),
  cash_in               numeric(18,2) not null default 0 check (cash_in >= 0),
  cash_out              numeric(18,2) not null default 0 check (cash_out >= 0),
  -- Signed net amount, always derivable, never a second source of truth.
  amount                numeric(18,2) not null generated always as (cash_in - cash_out) stored,
  source_balance        numeric(18,2),         -- RULE 8: saldo as reported by the spreadsheet — kept, never hidden, never authoritative
  internal_transfer_id  uuid,                  -- FK added in this file after internal_transfers exists
  source_type           text not null default 'google_sheet' check (source_type in ('google_sheet','manual','system')),
  source_sheet          text,
  source_row_id         text,
  source_fingerprint    text not null,
  sync_batch_id         uuid references sync_batches(id),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (source_fingerprint)
);
create trigger trg_cashflow_transactions_touch before update on cashflow_transactions
  for each row execute function fn_touch_updated_at();
create index idx_cf_txn_date on cashflow_transactions (transaction_date);
create index idx_cf_txn_account on cashflow_transactions (bank_account_id);
create index idx_cf_txn_account_date on cashflow_transactions (bank_account_id, transaction_date, created_at);
create index idx_cf_txn_category on cashflow_transactions (category_id);
create index idx_cf_txn_batch on cashflow_transactions (sync_batch_id);
create index idx_cf_txn_type on cashflow_transactions (transaction_type);

comment on column cashflow_transactions.source_fingerprint is
  'Idempotency key for re-sync: source_sheet + source_row_id + transaction_date + bank_account + amount + description (see lib/cashflow/fingerprint.ts). Re-syncing the same sheet must never create a second row for the same source row.';

create table sync_errors (
  id             uuid primary key default uuid_generate_v4(),
  sync_batch_id  uuid references sync_batches(id) on delete cascade,
  source_sheet   text,
  source_row_id  text,
  raw_data       jsonb,
  issue_type     text not null check (issue_type in (
                    'invalid_date','unknown_account','invalid_amount',
                    'both_debit_credit_filled','duplicate_suspected',
                    'missing_description','running_balance_mismatch',
                    'account_mapping_missing','other')),
  message        text not null,
  status         text not null default 'open' check (status in ('open','resolved','ignored')),
  resolved_by    uuid references profiles(id),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index idx_sync_errors_status on sync_errors (status) where status = 'open';
create index idx_sync_errors_batch on sync_errors (sync_batch_id);

-- Internal transfer matching. Two cashflow_transactions rows (one
-- INTERNAL_TRANSFER_OUT on the source account, one INTERNAL_TRANSFER_IN on
-- the destination account) are linked here so consolidated reporting can
-- net them to zero (RULE 3) while per-account cashflow still shows both legs.
create table internal_transfers (
  id                    uuid primary key default uuid_generate_v4(),
  transfer_date         date not null,
  amount                numeric(18,2) not null check (amount > 0),
  from_bank_account_id  uuid references bank_accounts(id),
  to_bank_account_id    uuid references bank_accounts(id),
  from_transaction_id   uuid references cashflow_transactions(id),
  to_transaction_id     uuid references cashflow_transactions(id),
  match_confidence      text not null default 'manual' check (match_confidence in ('high','medium','low','manual')),
  status                text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  confirmed_by          uuid references profiles(id),
  confirmed_at          timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (from_bank_account_id is distinct from to_bank_account_id)
);
create trigger trg_internal_transfers_touch before update on internal_transfers
  for each row execute function fn_touch_updated_at();
create index idx_internal_transfers_status on internal_transfers (status);
create index idx_internal_transfers_date on internal_transfers (transfer_date);

alter table cashflow_transactions
  add constraint fk_cf_txn_internal_transfer
  foreign key (internal_transfer_id) references internal_transfers(id);
