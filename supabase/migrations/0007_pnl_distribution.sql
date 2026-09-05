-- =====================================================================
-- 0007 — P&L SNAPSHOTS, PUBLISHING GUARD, PROFIT DISTRIBUTION
-- =====================================================================

create table pnl_reports (
  id                    uuid primary key default uuid_generate_v4(),
  outlet_id             uuid not null references outlets(id),
  entity_id             uuid not null references entities(id),
  accounting_period_id  uuid not null references accounting_periods(id),
  revenue               numeric(18,2) not null default 0,
  cogs                  numeric(18,2) not null default 0,
  gross_profit          numeric(18,2) generated always as (revenue - cogs) stored,
  operating_expense     numeric(18,2) not null default 0,
  operating_profit      numeric(18,2) generated always as (revenue - cogs - operating_expense) stored,
  other_income          numeric(18,2) not null default 0,
  other_expense         numeric(18,2) not null default 0,
  net_profit            numeric(18,2) generated always as
    (revenue - cogs - operating_expense + other_income - other_expense) stored,
  status                pnl_status not null default 'draft',
  generated_at          timestamptz not null default now(),
  approved_by           uuid references profiles(id),
  approved_at           timestamptz,
  published_at          timestamptz,
  unique (outlet_id, accounting_period_id)
);

-- ---------------------------------------------------------------------
-- CORRECTION #5: the actual checklist, computed server-side — not a UI
-- promise. Returns one row per check so the Month-Closing dashboard can
-- render exactly which item is blocking.
-- ---------------------------------------------------------------------
create or replace function fn_period_readiness(p_period_id uuid, p_outlet_id uuid)
returns jsonb
language plpgsql stable as $$
declare
  v_period accounting_periods%rowtype;
  v_start date; v_end date;
  v_open_exceptions int;
  v_unposted_journals int;
  v_pnl_status pnl_status;
  v_result jsonb;
begin
  select * into v_period from accounting_periods where id = p_period_id;
  v_start := make_date(v_period.period_year, v_period.period_month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;

  select count(*) into v_open_exceptions
  from exceptions e
  where e.status = 'open'
    and (
      (e.source_table = 'bank_transactions_raw' and exists (
        select 1 from bank_transactions_raw b where b.id = e.source_id
        and b.txn_date between v_start and v_end
        and (b.detected_outlet_id = p_outlet_id or b.detected_outlet_id is null)
      ))
      or
      (e.source_table = 'revenue_transactions_raw' and exists (
        select 1 from revenue_transactions_raw r where r.id = e.source_id
        and r.txn_date between v_start and v_end
        and (r.outlet_id = p_outlet_id or r.outlet_id is null)
      ))
    );

  select count(*) into v_unposted_journals
  from journal_headers jh
  where jh.accounting_period_id = p_period_id
    and jh.status not in ('posted','reversed')
    and exists (select 1 from journal_lines jl where jl.journal_id = jh.id and jl.outlet_id = p_outlet_id);

  select status into v_pnl_status from pnl_reports
    where outlet_id = p_outlet_id and accounting_period_id = p_period_id;

  v_result := jsonb_build_object(
    'bank_import_complete', v_period.bank_import_complete,
    'revenue_import_complete', v_period.revenue_import_complete,
    'no_blocking_exceptions', v_open_exceptions = 0,
    'open_exception_count', v_open_exceptions,
    'all_journals_posted', v_unposted_journals = 0,
    'unposted_journal_count', v_unposted_journals,
    'allocation_complete', v_period.allocation_complete,
    'pnl_approved', coalesce(v_pnl_status = 'approved', false),
    'ready_to_publish',
      v_period.bank_import_complete
      and v_period.revenue_import_complete
      and v_open_exceptions = 0
      and v_unposted_journals = 0
      and v_period.allocation_complete
      and coalesce(v_pnl_status = 'approved', false)
  );
  return v_result;
end;
$$;

-- Only path by which a pnl_report may reach 'published'. Direct UPDATEs
-- setting status='published' are rejected by the trigger below unless
-- they go through this function (which sets a transaction-local flag).
create or replace function fn_publish_pnl(p_pnl_report_id uuid, p_actor uuid)
returns void language plpgsql as $$
declare
  v_report pnl_reports%rowtype;
  v_readiness jsonb;
begin
  select * into v_report from pnl_reports where id = p_pnl_report_id;
  if v_report.id is null then
    raise exception 'P&L report % not found', p_pnl_report_id;
  end if;

  v_readiness := fn_period_readiness(v_report.accounting_period_id, v_report.outlet_id);
  if not (v_readiness->>'ready_to_publish')::boolean then
    raise exception 'Period is not ready to publish: %', v_readiness;
  end if;

  perform set_config('myapp.allow_publish', 'true', true);
  update pnl_reports
    set status = 'published', published_at = now()
    where id = p_pnl_report_id;

  insert into audit_log (user_id, action, entity_table, entity_id, new_value)
    values (p_actor, 'pnl_published', 'pnl_reports', p_pnl_report_id, v_readiness);
end;
$$;

create or replace function fn_guard_pnl_publish() returns trigger as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    if coalesce(current_setting('myapp.allow_publish', true), 'false') <> 'true' then
      raise exception 'pnl_reports.status can only become published via fn_publish_pnl().';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_guard_pnl_publish
  before update on pnl_reports
  for each row execute function fn_guard_pnl_publish();

-- CORRECTION #5: the only sanctioned way out of closed/published, logged.
create or replace function fn_reopen_period(p_period_id uuid, p_actor uuid, p_reason text)
returns void language plpgsql as $$
declare
  v_role user_role;
begin
  select role into v_role from profiles where id = p_actor;
  if v_role not in ('super_admin','finance_manager') then
    raise exception 'Role % is not authorized to reopen a period.', v_role;
  end if;
  update accounting_periods
    set status = 'open', reopened_at = now(), reopened_by = p_actor, reopen_reason = p_reason
    where id = p_period_id;
  insert into audit_log (user_id, action, entity_table, entity_id, new_value)
    values (p_actor, 'period_reopened', 'accounting_periods', p_period_id, jsonb_build_object('reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------
-- PROFIT DISTRIBUTION — values below are written ONCE at calculation
-- time and are a true snapshot (CORRECTION #4): they do not recompute
-- from investor_ownerships on read, so a later ownership change never
-- rewrites history. fn_ownership_as_of() (0002) is what the application
-- calls at calculation time to pick the period-correct ownership.
-- ---------------------------------------------------------------------
create table profit_distributions (
  id                    uuid primary key default uuid_generate_v4(),
  outlet_id             uuid not null references outlets(id),
  accounting_period_id  uuid not null references accounting_periods(id),
  pnl_report_id         uuid not null references pnl_reports(id),
  contract_id           uuid not null references partnership_contracts(id),
  net_profit_snapshot   numeric(18,2) not null,   -- pnl at calculation time
  distribution_pct_snapshot numeric(6,3) not null,
  distributable_profit  numeric(18,2) generated always as
    (round(net_profit_snapshot * distribution_pct_snapshot / 100, 2)) stored,
  status                distribution_status not null default 'calculated',
  approved_by           uuid references profiles(id),
  approved_at           timestamptz,
  created_at            timestamptz not null default now(),
  unique (outlet_id, accounting_period_id)
);

create table investor_profit_shares (
  id                      uuid primary key default uuid_generate_v4(),
  profit_distribution_id  uuid not null references profit_distributions(id) on delete cascade,
  investor_id             uuid not null references investors(id),
  -- CORRECTION #4: both snapshotted at calculation time via
  -- fn_ownership_as_of(outlet_id, period_end_date) — never a live join.
  ownership_pct_snapshot  numeric(9,6) not null,
  share_amount            numeric(18,2) not null,
  status                  distribution_status not null default 'calculated',
  payment_date            date,
  payment_reference       text,
  proof_of_payment_url    text,
  notes                   text,
  created_at              timestamptz not null default now(),
  unique (profit_distribution_id, investor_id)
);

-- CORRECTION #4: once approved or paid, the snapshot is frozen. Only a
-- status-forward move (approved -> paid) or payment metadata may change;
-- the financial snapshot columns become immutable.
create or replace function fn_lock_distribution_snapshot() returns trigger as $$
begin
  if old.status in ('approved','paid') then
    if new.net_profit_snapshot is distinct from old.net_profit_snapshot
       or new.distribution_pct_snapshot is distinct from old.distribution_pct_snapshot
       or new.outlet_id is distinct from old.outlet_id
       or new.accounting_period_id is distinct from old.accounting_period_id then
      raise exception 'profit_distributions % is % — its snapshot is frozen.', old.id, old.status;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_lock_distribution_snapshot
  before update on profit_distributions
  for each row execute function fn_lock_distribution_snapshot();

create or replace function fn_lock_share_snapshot() returns trigger as $$
begin
  if old.status in ('approved','paid') then
    if new.ownership_pct_snapshot is distinct from old.ownership_pct_snapshot
       or new.share_amount is distinct from old.share_amount
       or new.investor_id is distinct from old.investor_id then
      raise exception 'investor_profit_shares % is % — its snapshot is frozen.', old.id, old.status;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_lock_share_snapshot
  before update on investor_profit_shares
  for each row execute function fn_lock_share_snapshot();
