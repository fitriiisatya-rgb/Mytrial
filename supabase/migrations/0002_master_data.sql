-- =====================================================================
-- 0002 — IDENTITY & MASTER DATA
-- =====================================================================

-- One row per authenticated user. Role drives every RLS policy downstream.
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          user_role not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_profiles_touch before update on profiles
  for each row execute function fn_touch_updated_at();

create table entities (
  id            uuid primary key default uuid_generate_v4(),
  code          text not null unique,
  name          text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Chart of Accounts is created before `banks` and `outlets` because
-- CORRECTION #1 requires every bank account to reference its own COA
-- from the moment the row exists (not null), not bolted on later.
create table coa (
  id               uuid primary key default uuid_generate_v4(),
  code             text not null unique,
  name             text not null,
  account_type     account_type not null,
  parent_id        uuid references coa(id),
  normal_balance   normal_balance not null,
  -- null => balance sheet account, excluded from P&L by construction
  pnl_category     text check (pnl_category in
                     ('revenue','cogs','opex','other_income','other_expense') or pnl_category is null),
  reporting_order  integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table outlets (
  id                  uuid primary key default uuid_generate_v4(),
  entity_id           uuid not null references entities(id),
  outlet_code         text not null unique,
  outlet_name         text not null,
  area                text,
  address             text,
  status              text not null default 'active',
  opening_date        date,
  partnership_start   date,
  partnership_end     date,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger trg_outlets_touch before update on outlets
  for each row execute function fn_touch_updated_at();

-- CORRECTION #1: coa_id is NOT NULL. A bank account cannot exist in this
-- system without a designated ledger account — "generic Kas & Bank for
-- everyone" is exactly what we are eliminating. Bank reconciliation
-- (separate requirement) additionally needs every journal_lines row to
-- carry bank_account_id directly — see 0005.
create table banks (
  id            uuid primary key default uuid_generate_v4(),
  entity_id     uuid not null references entities(id),
  account_no    text not null,
  account_name  text not null,
  bank_name     text not null,
  coa_id        uuid not null references coa(id),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (bank_name, account_no)
);
comment on column banks.coa_id is
  'CORRECTION #1: mandatory, bank-specific ledger account. Bank-expense '
  'journals credit THIS account, never a shared generic cash account.';

create table investors (
  id              uuid primary key default uuid_generate_v4(),
  investor_code   text not null unique,
  full_name       text not null,
  email           text,
  phone           text,
  profile_id      uuid references profiles(id),
  status          text not null default 'active',
  created_at      timestamptz not null default now()
);

create table partnership_contracts (
  id                            uuid primary key default uuid_generate_v4(),
  outlet_id                     uuid not null references outlets(id),
  contract_number               text not null unique,
  start_date                    date not null,
  end_date                      date not null,
  duration_months               integer,
  total_investment              numeric(18,2) not null default 0,
  profit_distribution_pct       numeric(6,3) not null check (profit_distribution_pct between 0 and 100),
  retained_profit_pct           numeric(6,3) generated always as (100 - profit_distribution_pct) stored,
  active                        boolean not null default true,
  created_at                    timestamptz not null default now(),
  check (end_date > start_date)
);

-- Ownership is effective-dated. CORRECTION #4 depends on this: a profit
-- distribution for period P must use the ownership row(s) valid DURING
-- P, not whatever is flagged `active` today. See fn_ownership_as_of below.
create table investor_ownerships (
  id                     uuid primary key default uuid_generate_v4(),
  investor_id            uuid not null references investors(id),
  outlet_id              uuid not null references outlets(id),
  contract_id            uuid not null references partnership_contracts(id),
  ownership_pct          numeric(9,6) not null check (ownership_pct between 0 and 100),
  investment_amount      numeric(18,2) not null default 0,
  start_date             date not null,
  end_date               date,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  created_by             uuid references profiles(id),
  check (end_date is null or end_date > start_date)
);
create index idx_ownership_outlet_active on investor_ownerships (outlet_id) where active;
create index idx_ownership_investor on investor_ownerships (investor_id);
create index idx_ownership_effective on investor_ownerships (outlet_id, start_date, end_date);

-- CORRECTION #4 helper: ownership valid as of a given date, regardless of
-- the `active` flag (which only tells you "not superseded yet", not
-- "was this the row in force back in period P").
create or replace function fn_ownership_as_of(p_outlet_id uuid, p_as_of date)
returns table (investor_id uuid, ownership_pct numeric)
language sql stable as $$
  select investor_id, ownership_pct
  from investor_ownerships
  where outlet_id = p_outlet_id
    and start_date <= p_as_of
    and (end_date is null or end_date >= p_as_of);
$$;

-- CORRECTION #5: accounting_periods carries explicit, manually-toggled
-- readiness flags (bank/revenue import, allocation) alongside the
-- computable checks (exceptions, journals posted) — see fn_period_readiness
-- in 0007, which reads both.
create table accounting_periods (
  id                          uuid primary key default uuid_generate_v4(),
  entity_id                   uuid not null references entities(id),
  period_month                smallint not null check (period_month between 1 and 12),
  period_year                 smallint not null,
  status                      period_status not null default 'open',
  bank_import_complete        boolean not null default false,
  revenue_import_complete     boolean not null default false,
  allocation_complete         boolean not null default false,
  closed_at                   timestamptz,
  closed_by                   uuid references profiles(id),
  published_at                timestamptz,
  reopened_at                 timestamptz,
  reopened_by                 uuid references profiles(id),
  reopen_reason               text,
  created_at                  timestamptz not null default now(),
  unique (entity_id, period_year, period_month)
);

-- =====================================================================
-- AUDIT TRAIL (kept next to profiles: every trigger/function below
-- writes here, so it must exist before anything else references it)
-- =====================================================================
create table audit_log (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references profiles(id),
  action        text not null,
  entity_table  text not null,
  entity_id     uuid not null,
  old_value     jsonb,
  new_value     jsonb,
  created_at    timestamptz not null default now()
);
create index idx_audit_entity on audit_log (entity_table, entity_id);

-- =====================================================================
-- AUTH / RLS HELPER FUNCTIONS
-- Defined here (not in the RLS migration) because later migrations'
-- functions (fn_reopen_period, fn_publish_pnl) need role checks too.
-- =====================================================================
create or replace function auth_role() returns user_role
language sql stable security definer as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function auth_investor_id() returns uuid
language sql stable security definer as $$
  select id from investors where profile_id = auth.uid();
$$;

create or replace function auth_accessible_outlets() returns setof uuid
language sql stable security definer as $$
  select outlet_id from investor_ownerships
  where investor_id = auth_investor_id() and active = true;
$$;
