-- =====================================================================
-- 0003 — IMPORT BATCHES, REVENUE SOURCE CONFIG, RAW TRANSACTIONS
-- =====================================================================

create table import_batches (
  id                uuid primary key default uuid_generate_v4(),
  source            import_source_type not null,
  source_ref        text,                 -- sheet URL/ID or filename
  imported_by       uuid references profiles(id),
  imported_at       timestamptz not null default now(),
  row_count         integer not null default 0,
  duplicate_count   integer not null default 0,
  error_count       integer not null default 0,
  status            text not null default 'completed'
);

-- CORRECTION #3: revenue is never hardcoded to "Dr Bank". Each revenue
-- source declares which COA gets debited (a real bank, a payment-gateway
-- clearing account, a receivable/piutang account for unsettled sales,
-- etc). The revenue engine (Phase 5) reads this instead of assuming cash.
create table revenue_sources (
  id                uuid primary key default uuid_generate_v4(),
  code              text not null unique,
  name              text not null,
  clearing_coa_id   uuid not null references coa(id),
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
comment on column revenue_sources.clearing_coa_id is
  'CORRECTION #3: configurable debit/clearing account for this revenue '
  'source — e.g. a payment gateway clearing account or piutang, not '
  'assumed to be cash-in-bank.';

-- Raw bank book rows (Source A). Only Kredit > 0 rows are ever treated as
-- pengeluaran candidates (spec section 3) — enforced in application logic,
-- not here, since we still want to store 100% of the source file for audit.
create table bank_transactions_raw (
  id                    uuid primary key default uuid_generate_v4(),
  import_batch_id       uuid references import_batches(id),
  bank_id               uuid references banks(id),
  bank_label_raw        text not null,         -- exact label as it appeared in the source file
  txn_date              date not null,
  unit_raw              text,
  classification_raw    text,
  description_raw       text,
  debit                 numeric(18,2) not null default 0,
  credit                numeric(18,2) not null default 0,
  running_balance       numeric(18,2),
  external_ref          text,                  -- CORRECTION #6: bank/PSP transaction ID, when the source provides one
  source_row_ref        text,                  -- e.g. spreadsheet row number
  fingerprint           text not null,         -- fallback dedupe key: bank+date+classification+desc+amount
  -- CORRECTION #6: prefer external_ref when present, fall back to
  -- fingerprint. A generated column keeps this rule enforced at the
  -- database level, not scattered across application code paths.
  dedupe_key            text generated always as
                           (coalesce(nullif(external_ref, ''), fingerprint)) stored,
  detected_outlet_id    uuid references outlets(id),
  detected_coa_id       uuid references coa(id),
  is_interbank_transfer boolean not null default false,
  transfer_pair_id      uuid,
  journal_id            uuid,                  -- fk added in 0005 once journal_headers exists
  processed             boolean not null default false,
  exception_status      exception_status,       -- denormalized for fast dashboard counts; source of truth is `exceptions`
  created_at            timestamptz not null default now(),
  unique (dedupe_key)
);
create index idx_bank_txn_unprocessed on bank_transactions_raw (processed) where not processed;
create index idx_bank_txn_credit on bank_transactions_raw (credit) where credit > 0;
create index idx_bank_txn_date on bank_transactions_raw (txn_date);
create index idx_bank_txn_batch on bank_transactions_raw (import_batch_id);

-- Revenue (Source B) — deliberately separate from bank inflows.
create table revenue_transactions_raw (
  id                uuid primary key default uuid_generate_v4(),
  import_batch_id   uuid references import_batches(id),
  revenue_source_id uuid not null references revenue_sources(id),
  txn_date          date not null,
  outlet_id         uuid references outlets(id),
  outlet_raw        text,
  description       text,
  revenue_category  text,
  amount            numeric(18,2) not null check (amount >= 0),
  external_ref      text,
  fingerprint       text not null,
  dedupe_key        text generated always as
                       (coalesce(nullif(external_ref, ''), fingerprint)) stored,
  journal_id        uuid,
  processed         boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (dedupe_key)
);
create index idx_revenue_unprocessed on revenue_transactions_raw (processed) where not processed;
create index idx_revenue_batch on revenue_transactions_raw (import_batch_id);
