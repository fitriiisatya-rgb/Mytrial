-- =====================================================================
-- 0010 — CASHFLOW MODULE: MASTER DATA (bank_accounts, categories)
-- =====================================================================
-- This migration starts a module that is deliberately independent of the
-- accounting domain (0001-0008): no COA, no journal, no investor/ownership
-- references. Cashflow Management tracks cash in/out/balance per bank
-- account only. See supabase/CASHFLOW_README.md for the full rationale.

create table bank_accounts (
  id                      uuid primary key default uuid_generate_v4(),
  account_code            text not null unique,
  account_name            text not null,          -- stable identity, e.g. "BCA AMOR" vs "BCA IKI"
  bank_name               text not null,
  account_number          text,                    -- real number, server-side only; mask before rendering
  entity_label            text,                    -- free-text grouping (company/unit), not FK'd to accounting.entities on purpose
  opening_balance         numeric(18,2) not null default 0,
  opening_balance_date    date not null default current_date,
  is_active               boolean not null default true,
  display_order           integer not null default 0,
  sheet_label             text,                    -- exact "Bank/Rekening" text as it appears in the source spreadsheet, used by the sync matcher
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger trg_bank_accounts_touch before update on bank_accounts
  for each row execute function fn_touch_updated_at();
create index idx_bank_accounts_active on bank_accounts (is_active);
create unique index uq_bank_accounts_sheet_label on bank_accounts (lower(sheet_label)) where sheet_label is not null;

comment on table bank_accounts is
  'Cashflow module master rekening. Independent of accounting.banks (COA-linked) — do not join the two.';
comment on column bank_accounts.account_number is
  'Server-side only. Never select this column into a client-facing query; use account_number_masked (see view v_bank_accounts_public) instead.';

-- Convenience view: never leak the full account number to the client.
create or replace view v_bank_accounts_public as
select
  id, account_code, account_name, bank_name,
  case
    when account_number is null or length(account_number) < 4 then account_number
    else repeat('*', 4) || ' ' || repeat('*', 4) || ' ' || right(account_number, 4)
  end as account_number_masked,
  entity_label, opening_balance, opening_balance_date,
  is_active, display_order, created_at, updated_at
from bank_accounts;

-- Cashflow categories — NOT a chart of accounts. Simple, editable, flat list
-- used purely to tag the purpose of a cash in/out movement.
create table cashflow_categories (
  id              uuid primary key default uuid_generate_v4(),
  code            text not null unique,
  name            text not null,
  type            text not null check (type in ('CASH_IN','CASH_OUT')),
  is_internal_transfer boolean not null default false,
  is_active       boolean not null default true,
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_cashflow_categories_touch before update on cashflow_categories
  for each row execute function fn_touch_updated_at();
create index idx_cashflow_categories_type on cashflow_categories (type) where is_active;

-- Free-form, low-risk configuration store for the sync engine (e.g. which
-- physical column maps to cash-in vs cash-out, default sheet/tab name).
-- Keeping this in the DB (rather than hardcoded) is what makes the mapping
-- layer configurable without a redeploy.
create table sync_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id)
);
