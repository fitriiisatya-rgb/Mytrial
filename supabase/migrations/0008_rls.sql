-- =====================================================================
-- 0008 — ROW LEVEL SECURITY
-- =====================================================================

alter table entities enable row level security;
alter table outlets enable row level security;
alter table coa enable row level security;
alter table banks enable row level security;
alter table investors enable row level security;
alter table partnership_contracts enable row level security;
alter table investor_ownerships enable row level security;
alter table accounting_periods enable row level security;
alter table revenue_sources enable row level security;
alter table import_batches enable row level security;
alter table bank_transactions_raw enable row level security;
alter table revenue_transactions_raw enable row level security;
alter table outlet_mapping_rules enable row level security;
alter table coa_mapping_rules enable row level security;
alter table exceptions enable row level security;
alter table journal_headers enable row level security;
alter table journal_lines enable row level security;
alter table allocation_rules enable row level security;
alter table allocation_rule_outlets enable row level security;
alter table pnl_reports enable row level security;
alter table profit_distributions enable row level security;
alter table investor_profit_shares enable row level security;
alter table audit_log enable row level security;
alter table profiles enable row level security;

-- Everyone can read their own profile row; only super_admin manages roles.
create policy profile_self_read on profiles for select using (id = auth.uid());
create policy profile_admin_all on profiles for all
  using (auth_role() = 'super_admin');

-- Internal staff: operational tables.
create policy staff_rw_entities on entities for all
  using (auth_role() in ('super_admin','accounting','finance_manager','management'));
create policy staff_rw_outlets on outlets for all
  using (auth_role() in ('super_admin','accounting','finance_manager','management'));
create policy staff_rw_coa on coa for all
  using (auth_role() in ('super_admin','accounting','finance_manager','management'));
create policy staff_rw_banks on banks for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_revenue_sources on revenue_sources for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_contracts on partnership_contracts for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_ownerships on investor_ownerships for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_periods on accounting_periods for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_import_batches on import_batches for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_bank_txn on bank_transactions_raw for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_revenue_txn on revenue_transactions_raw for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_outlet_rules on outlet_mapping_rules for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_coa_rules on coa_mapping_rules for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_exceptions on exceptions for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_journal_headers on journal_headers for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_journal_lines on journal_lines for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_allocation_rules on allocation_rules for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_rw_allocation_outlets on allocation_rule_outlets for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));
create policy staff_read_audit on audit_log for select
  using (auth_role() in ('super_admin','finance_manager'));

-- Management + accounting/finance: read consolidated reports; only
-- accounting/finance_manager write them (via the guarded functions above).
create policy report_read_pnl on pnl_reports for select
  using (auth_role() in ('super_admin','accounting','finance_manager','management'));
create policy report_write_pnl on pnl_reports for insert with check (
  auth_role() in ('super_admin','accounting','finance_manager'));
create policy report_update_pnl on pnl_reports for update using (
  auth_role() in ('super_admin','accounting','finance_manager'));
create policy report_read_distribution on profit_distributions for select
  using (auth_role() in ('super_admin','accounting','finance_manager','management'));
create policy report_write_distribution on profit_distributions for insert with check (
  auth_role() in ('super_admin','accounting','finance_manager'));
create policy report_update_distribution on profit_distributions for update using (
  auth_role() in ('super_admin','accounting','finance_manager'));
create policy report_rw_shares on investor_profit_shares for all
  using (auth_role() in ('super_admin','accounting','finance_manager','management'));

-- Investors: strictly scoped, published-only, own-outlet-only.
-- No policy is created here for bank_transactions_raw, journal_headers,
-- journal_lines, exceptions, mapping rules, or audit_log for the
-- investor role — absence of a policy means denial under RLS, which is
-- the intended behaviour (raw GL and internal mapping never reach the
-- portal, matching spec section 26/46 exactly).

create policy investor_read_own_row on investors for select
  using (auth_role() = 'investor' and profile_id = auth.uid());

create policy investor_read_own_ownership on investor_ownerships for select
  using (auth_role() = 'investor' and investor_id = auth_investor_id());

create policy investor_read_own_outlets on outlets for select
  using (auth_role() = 'investor' and id in (select auth_accessible_outlets()));

create policy investor_read_published_pnl on pnl_reports for select
  using (auth_role() = 'investor'
         and status = 'published'
         and outlet_id in (select auth_accessible_outlets()));

create policy investor_read_own_distribution on profit_distributions for select
  using (auth_role() = 'investor'
         and outlet_id in (select auth_accessible_outlets())
         and status in ('approved','paid'));

create policy investor_read_own_share on investor_profit_shares for select
  using (auth_role() = 'investor' and investor_id = auth_investor_id());
