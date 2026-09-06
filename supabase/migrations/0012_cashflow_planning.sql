-- =====================================================================
-- 0012 — CASHFLOW MODULE: PLANNING, PAYMENT SCHEDULE
-- Scaffolded now (Phase 3 schema) so Phase 1/2 does not need a rewrite
-- later. UI for these lands in Phase 3; the tables and FKs exist today.
-- =====================================================================

create table planned_cashflows (
  id                       uuid primary key default uuid_generate_v4(),
  plan_date                date not null,
  bank_account_id          uuid not null references bank_accounts(id),
  type                     text not null check (type in ('CASH_IN','CASH_OUT')),
  category_id              uuid references cashflow_categories(id),
  description              text,
  amount                   numeric(18,2) not null check (amount > 0),
  status                   text not null default 'PLANNED' check (status in
                             ('PLANNED','APPROVED','PAID','RECEIVED','CANCELLED')),
  is_recurring             boolean not null default false,
  recurrence_rule          text,             -- e.g. 'MONTHLY' — simple, expand later if needed
  source                   text not null default 'manual' check (source in ('manual','payment_schedule')),
  linked_payment_schedule_id uuid,           -- FK added in this file after payment_schedules exists
  -- RULE 9/10: a plan becoming real must be *matched*, not merged into or
  -- allowed to overwrite the historical actual transaction.
  matched_transaction_id   uuid references cashflow_transactions(id),
  notes                    text,
  created_by               uuid references profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger trg_planned_cashflows_touch before update on planned_cashflows
  for each row execute function fn_touch_updated_at();
create index idx_planned_cf_date on planned_cashflows (plan_date);
create index idx_planned_cf_account on planned_cashflows (bank_account_id);
create index idx_planned_cf_status on planned_cashflows (status) where status not in ('PAID','RECEIVED','CANCELLED');

create table payment_schedules (
  id                    uuid primary key default uuid_generate_v4(),
  due_date              date not null,
  bank_account_id       uuid references bank_accounts(id),
  payee                 text not null,
  description           text,
  category_id           uuid references cashflow_categories(id),
  amount                numeric(18,2) not null check (amount > 0),
  status                text not null default 'DRAFT' check (status in
                          ('DRAFT','SCHEDULED','APPROVED','PAID','CANCELLED')),
  priority              text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  planned_cashflow_id   uuid references planned_cashflows(id),
  paid_transaction_id   uuid references cashflow_transactions(id),
  notes                 text,
  created_by            uuid references profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_payment_schedules_touch before update on payment_schedules
  for each row execute function fn_touch_updated_at();
create index idx_payment_sched_due on payment_schedules (due_date);
create index idx_payment_sched_status on payment_schedules (status) where status not in ('PAID','CANCELLED');

alter table planned_cashflows
  add constraint fk_planned_cf_payment_schedule
  foreign key (linked_payment_schedule_id) references payment_schedules(id);
