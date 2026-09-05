-- =====================================================================
-- 0012 — CASHFLOW MODULE: BALANCE SNAPSHOTS & ALERTS
-- =====================================================================

-- Daily aggregate cache per account. Populated/refreshed by
-- fn_rebuild_balance_snapshots() (0013) after every sync. Exists so the
-- dashboard/chart/report queries never have to scan full transaction
-- history (PERFORMANCE requirement) once volumes grow into the tens of
-- thousands of rows.
create table account_balance_snapshots (
  id                      uuid primary key default uuid_generate_v4(),
  bank_account_id         uuid not null references bank_accounts(id),
  snapshot_date           date not null,
  opening_balance         numeric(18,2) not null,
  cash_in                 numeric(18,2) not null default 0,
  cash_out                numeric(18,2) not null default 0,
  closing_balance         numeric(18,2) not null,
  source_balance          numeric(18,2),
  reconciliation_status   text not null default 'MATCHED' check (reconciliation_status in
                             ('MATCHED','DIFFERENCE','NEED_REVIEW')),
  created_at              timestamptz not null default now(),
  unique (bank_account_id, snapshot_date)
);
create index idx_snapshots_date on account_balance_snapshots (snapshot_date);
create index idx_snapshots_account_date on account_balance_snapshots (bank_account_id, snapshot_date);

create table alert_rules (
  id                uuid primary key default uuid_generate_v4(),
  alert_type        text not null check (alert_type in
                       ('LOW_BALANCE','NEGATIVE_PROJECTED_BALANCE','LARGE_PAYMENT',
                        'RECONCILIATION_DIFFERENCE','STALE_SYNC')),
  bank_account_id   uuid references bank_accounts(id), -- null = applies to every active account
  threshold_amount  numeric(18,2),
  threshold_hours   integer,             -- used by STALE_SYNC
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_alert_rules_touch before update on alert_rules
  for each row execute function fn_touch_updated_at();

create table cashflow_alerts (
  id              uuid primary key default uuid_generate_v4(),
  alert_rule_id   uuid references alert_rules(id),
  alert_type      text not null check (alert_type in
                     ('LOW_BALANCE','NEGATIVE_PROJECTED_BALANCE','LARGE_PAYMENT',
                      'RECONCILIATION_DIFFERENCE','STALE_SYNC')),
  bank_account_id uuid references bank_accounts(id),
  severity        text not null default 'WARNING' check (severity in ('INFO','WARNING','CRITICAL')),
  message         text not null,
  related_date    date,
  related_amount  numeric(18,2),
  -- Anti-spam key: alert_type + account + related_date (see lib/cashflow/alerts.ts).
  -- Only one OPEN alert may exist per dedupe_key at a time.
  dedupe_key      text not null,
  status          text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  acknowledged_by uuid references profiles(id),
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now()
);
create unique index uq_cashflow_alerts_open_dedupe on cashflow_alerts (dedupe_key) where status = 'OPEN';
create index idx_cashflow_alerts_status on cashflow_alerts (status) where status = 'OPEN';
