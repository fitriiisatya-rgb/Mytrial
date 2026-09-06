-- =====================================================================
-- 0015 — CASHFLOW MODULE: RUNNING BALANCE, SNAPSHOTS, RECONCILIATION
-- =====================================================================

-- RULE 1: balance is always computed per account, ordered by date then
-- insertion order — never a cross-account cumulative sum.
create or replace view v_cashflow_running_balance as
select
  t.id as transaction_id,
  t.bank_account_id,
  t.transaction_date,
  t.description,
  t.unit,
  t.classification,
  t.category_id,
  t.transaction_type,
  t.cash_in,
  t.cash_out,
  t.amount,
  t.source_balance,
  t.internal_transfer_id,
  t.source_type,
  t.source_sheet,
  t.source_row_id,
  t.created_at,
  ba.opening_balance
    + sum(t.amount) over (
        partition by t.bank_account_id
        order by t.transaction_date, t.created_at
        rows between unbounded preceding and current row
      ) as running_balance
from cashflow_transactions t
join bank_accounts ba on ba.id = t.bank_account_id;

comment on view v_cashflow_running_balance is
  'Per-row calculated running balance, always Opening + cumulative(Cash In - Cash Out) within a single account. Never mixes accounts (RULE 1).';

-- Fast current-balance lookup per account (used by account cards + consolidated total).
create or replace view v_bank_account_balance as
select
  ba.id as bank_account_id,
  ba.account_code,
  ba.account_name,
  ba.bank_name,
  ba.is_active,
  ba.display_order,
  ba.opening_balance,
  coalesce(sum(t.cash_in), 0) as total_cash_in,
  coalesce(sum(t.cash_out), 0) as total_cash_out,
  ba.opening_balance + coalesce(sum(t.amount), 0) as current_balance
from bank_accounts ba
left join cashflow_transactions t on t.bank_account_id = ba.id
group by ba.id;

comment on view v_bank_account_balance is
  'Current balance = opening_balance + all-time Cash In - Cash Out for that account. Consolidated total cash position (RULE 2) = sum of current_balance for is_active accounts, computed in the app layer or via a plain sum() over this view.';

-- Rebuild the daily snapshot cache for one account (call after every sync
-- batch for each affected account, and whenever opening_balance changes).
-- Also produces the reconciliation status (RULE 8) by comparing the
-- calculated closing balance against the last source_balance reported by
-- the spreadsheet for that day, when one was provided.
create or replace function fn_rebuild_balance_snapshots(p_bank_account_id uuid)
returns void language plpgsql as $$
begin
  with daily as (
    select
      bank_account_id,
      transaction_date,
      sum(cash_in) as cash_in,
      sum(cash_out) as cash_out,
      (array_agg(source_balance order by created_at desc) filter (where source_balance is not null))[1] as source_balance
    from cashflow_transactions
    where bank_account_id = p_bank_account_id
    group by bank_account_id, transaction_date
  ),
  running as (
    select
      d.bank_account_id,
      d.transaction_date,
      d.cash_in,
      d.cash_out,
      d.source_balance,
      ba.opening_balance + coalesce(sum(d.cash_in - d.cash_out) over (
        order by d.transaction_date rows between unbounded preceding and 1 preceding
      ), 0) as opening_for_day,
      ba.opening_balance + sum(d.cash_in - d.cash_out) over (
        order by d.transaction_date rows between unbounded preceding and current row
      ) as closing_balance
    from daily d
    join bank_accounts ba on ba.id = d.bank_account_id
  )
  insert into account_balance_snapshots
    (bank_account_id, snapshot_date, opening_balance, cash_in, cash_out, closing_balance, source_balance, reconciliation_status)
  select
    bank_account_id, transaction_date, opening_for_day, cash_in, cash_out, closing_balance, source_balance,
    case
      when source_balance is null then 'MATCHED'
      when abs(source_balance - closing_balance) < 0.01 then 'MATCHED'
      else 'DIFFERENCE'
    end
  from running
  on conflict (bank_account_id, snapshot_date) do update set
    opening_balance = excluded.opening_balance,
    cash_in = excluded.cash_in,
    cash_out = excluded.cash_out,
    closing_balance = excluded.closing_balance,
    source_balance = excluded.source_balance,
    reconciliation_status = excluded.reconciliation_status;
end;
$$;

comment on function fn_rebuild_balance_snapshots(uuid) is
  'RULE 7/8: recomputes account_balance_snapshots for one account from scratch. Idempotent (upsert). Call after every sync batch for every bank_account_id touched by that batch.';
