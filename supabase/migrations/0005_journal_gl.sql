-- =====================================================================
-- 0005 — GENERAL LEDGER: JOURNAL HEADERS/LINES, WORKFLOW, GL VIEW
-- =====================================================================

create table journal_headers (
  id                    uuid primary key default uuid_generate_v4(),
  journal_number        text not null unique,
  journal_date          date not null,
  source_type           journal_source_type not null,
  source_id             uuid,                  -- points at raw txn / allocation rule / manual entry
  batch_id              uuid references import_batches(id),
  entity_id             uuid not null references entities(id),
  accounting_period_id  uuid not null references accounting_periods(id),
  status                journal_status not null default 'draft',
  description           text,
  created_by            uuid references profiles(id),
  reviewed_by           uuid references profiles(id),
  reviewed_at           timestamptz,
  approved_by           uuid references profiles(id),
  approved_at           timestamptz,
  posted_at             timestamptz,
  reversal_of_id        uuid references journal_headers(id),
  created_at            timestamptz not null default now(),
  -- CORRECTION #6: idempotency at the DB level — a given source row can
  -- generate at most one *active* (non-reversed) journal. Re-running the
  -- auto-journal engine on an already-journaled transaction cannot double it.
  constraint uq_journal_source unique (source_type, source_id)
);
create index idx_jh_period on journal_headers (accounting_period_id);
create index idx_jh_status on journal_headers (status);

create table journal_lines (
  id             uuid primary key default uuid_generate_v4(),
  journal_id     uuid not null references journal_headers(id) on delete cascade,
  line_no        integer not null default 1,
  coa_id         uuid not null references coa(id),
  entity_id      uuid not null references entities(id),
  outlet_id      uuid references outlets(id),
  -- Bank reconciliation requirement: every bank-side line is directly
  -- identifiable to one rekening, without having to reverse-join through
  -- coa -> banks (which breaks if a bank's coa_id is ever repointed).
  bank_account_id uuid references banks(id),
  department_id  uuid,
  cost_center_id uuid,
  debit          numeric(18,2) not null default 0,
  credit         numeric(18,2) not null default 0,
  description    text,
  created_at     timestamptz not null default now(),
  check (debit >= 0 and credit >= 0),
  check (not (debit > 0 and credit > 0))
);
create index idx_jl_journal on journal_lines (journal_id);
create index idx_jl_outlet_coa on journal_lines (outlet_id, coa_id);
create index idx_jl_bank_account on journal_lines (bank_account_id) where bank_account_id is not null;

alter table bank_transactions_raw
  add constraint bank_txn_journal_fk foreign key (journal_id) references journal_headers(id);
alter table revenue_transactions_raw
  add constraint revenue_txn_journal_fk foreign key (journal_id) references journal_headers(id);

-- ---------------------------------------------------------------------
-- CORRECTION #2: enforce the workflow, don't just record it as a status
-- string. Balance must hold once a journal reaches 'approved' or
-- 'posted'. Posted journals cannot be edited directly (reversal only).
-- ---------------------------------------------------------------------

create or replace function fn_check_journal_balanced() returns trigger as $$
declare
  v_debit numeric(18,2);
  v_credit numeric(18,2);
  v_status journal_status;
  v_journal_id uuid;
begin
  v_journal_id := coalesce(new.journal_id, old.journal_id);
  select status into v_status from journal_headers where id = v_journal_id;
  if v_status in ('approved','posted') then
    select coalesce(sum(debit),0), coalesce(sum(credit),0)
      into v_debit, v_credit
      from journal_lines where journal_id = v_journal_id;
    if v_debit <> v_credit then
      raise exception 'Journal % is not balanced (debit % <> credit %)', v_journal_id, v_debit, v_credit;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_journal_balanced
  after insert or update on journal_lines
  for each row execute function fn_check_journal_balanced();

create or replace function fn_block_posted_journal_edit() returns trigger as $$
begin
  -- Once posted, the row is frozen — including flipping status away from
  -- 'posted' to sneak in an edit. The only sanctioned way to change a
  -- posted journal's effect is a new reversal journal referencing it via
  -- reversal_of_id, never an UPDATE on the original row.
  if old.status = 'posted' then
    raise exception 'Posted journals cannot be edited directly. Use a reversal journal (source_type unchanged, reversal_of_id set).';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_block_posted_edit
  before update on journal_headers
  for each row execute function fn_block_posted_journal_edit();

-- CORRECTION #2 (balance-on-promotion): fn_check_journal_balanced (above)
-- only re-checks balance when journal_lines themselves are touched while
-- already approved/posted. Without this trigger, a header could be
-- promoted straight from 'draft' to 'approved'/'posted' with unbalanced
-- lines already in place, since no INSERT/UPDATE on journal_lines happens
-- at promotion time to fire that trigger.
create or replace function fn_check_journal_balanced_on_promotion() returns trigger as $$
declare
  v_debit numeric(18,2);
  v_credit numeric(18,2);
begin
  if new.status in ('approved','posted') and old.status is distinct from new.status then
    select coalesce(sum(debit),0), coalesce(sum(credit),0)
      into v_debit, v_credit
      from journal_lines where journal_id = new.id;
    if v_debit <> v_credit then
      raise exception 'Journal % cannot become % — not balanced (debit % <> credit %)',
        new.id, new.status, v_debit, v_credit;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_guard_journal_balance_on_promotion
  before update on journal_headers
  for each row execute function fn_check_journal_balanced_on_promotion();

-- CORRECTION #5 (partial — period lock): a closed/published period
-- accepts no new or changed journals unless the period has gone through
-- an explicit, audited reopen first (accounting_periods.status flips
-- back to 'open'/'review'). This trigger is the enforcement point;
-- fn_reopen_period() in 0007 is the only sanctioned way back to 'open'.
create or replace function fn_guard_period_lock() returns trigger as $$
declare
  v_status period_status;
begin
  select status into v_status from accounting_periods where id = new.accounting_period_id;
  if v_status in ('closed','published') then
    raise exception 'Accounting period % is % — reopen it explicitly before posting journals.',
      new.accounting_period_id, v_status;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_guard_period_lock
  before insert or update on journal_headers
  for each row execute function fn_guard_period_lock();

-- ---------------------------------------------------------------------
-- The single canonical read path for GL/P&L. CORRECTION #2 requires that
-- reporting NEVER reads draft/reviewed/approved-but-not-posted lines.
-- Every later report (P&L, GL screen, allocation base) queries this view,
-- never journal_lines directly.
-- ---------------------------------------------------------------------
create view v_posted_journal_lines as
  select jl.*, jh.journal_date, jh.accounting_period_id, jh.source_type, jh.status as journal_status
  from journal_lines jl
  join journal_headers jh on jh.id = jl.journal_id
  where jh.status = 'posted';

comment on view v_posted_journal_lines is
  'CORRECTION #2: canonical GL read path. Draft/reviewed/approved journals '
  'are invisible here by construction — only posted journals affect '
  'reported GL balances and P&L.';
