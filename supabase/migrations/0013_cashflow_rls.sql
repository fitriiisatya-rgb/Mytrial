-- =====================================================================
-- 0013 — CASHFLOW MODULE: ROW LEVEL SECURITY
-- Reuses auth_role() from 0002. Cashflow users are super_admin,
-- finance_manager (operates) and management (reads dashboards/reports).
-- accounting/investor roles have no policy here => denied by default,
-- matching the "cashflow is not accounting" separation.
-- =====================================================================

alter table bank_accounts enable row level security;
alter table cashflow_categories enable row level security;
alter table sync_config enable row level security;
alter table sync_batches enable row level security;
alter table cashflow_transactions enable row level security;
alter table sync_errors enable row level security;
alter table internal_transfers enable row level security;
alter table planned_cashflows enable row level security;
alter table payment_schedules enable row level security;
alter table account_balance_snapshots enable row level security;
alter table alert_rules enable row level security;
alter table cashflow_alerts enable row level security;

-- Read: super_admin, finance_manager, management.
create policy cf_read_bank_accounts on bank_accounts for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_categories on cashflow_categories for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_sync_config on sync_config for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_sync_batches on sync_batches for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_transactions on cashflow_transactions for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_sync_errors on sync_errors for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_internal_transfers on internal_transfers for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_planned_cashflows on planned_cashflows for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_payment_schedules on payment_schedules for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_snapshots on account_balance_snapshots for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_alert_rules on alert_rules for select
  using (auth_role() in ('super_admin','finance_manager','management'));
create policy cf_read_alerts on cashflow_alerts for select
  using (auth_role() in ('super_admin','finance_manager','management'));

-- Write: super_admin, finance_manager only. Management is read-only.
create policy cf_write_bank_accounts on bank_accounts for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_bank_accounts on bank_accounts for update using (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_delete_bank_accounts on bank_accounts for delete using (
  auth_role() = 'super_admin');

create policy cf_write_categories on cashflow_categories for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_categories on cashflow_categories for update using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_sync_config on sync_config for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_sync_config on sync_config for update using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_sync_batches on sync_batches for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_sync_batches on sync_batches for update using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_transactions on cashflow_transactions for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_transactions on cashflow_transactions for update using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_sync_errors on sync_errors for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_sync_errors on sync_errors for update using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_internal_transfers on internal_transfers for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_internal_transfers on internal_transfers for update using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_planned_cashflows on planned_cashflows for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_planned_cashflows on planned_cashflows for update using (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_delete_planned_cashflows on planned_cashflows for delete using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_payment_schedules on payment_schedules for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_payment_schedules on payment_schedules for update using (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_delete_payment_schedules on payment_schedules for delete using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_snapshots on account_balance_snapshots for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_snapshots on account_balance_snapshots for update using (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_delete_snapshots on account_balance_snapshots for delete using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_alert_rules on alert_rules for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_alert_rules on alert_rules for update using (
  auth_role() in ('super_admin','finance_manager'));

create policy cf_write_alerts on cashflow_alerts for insert with check (
  auth_role() in ('super_admin','finance_manager'));
create policy cf_update_alerts on cashflow_alerts for update using (
  auth_role() in ('super_admin','finance_manager','management'));
