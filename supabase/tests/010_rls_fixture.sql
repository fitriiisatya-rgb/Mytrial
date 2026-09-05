-- =====================================================================
-- RLS test fixture: super_admin, accounting, finance_manager, and two
-- investors each owning exactly one dedicated outlet (A / B), so cross-
-- investor / cross-outlet leakage is unambiguous to detect.
-- =====================================================================

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a001', 'super_admin@test.local'),
  ('a0000000-0000-0000-0000-00000000a002', 'accounting@test.local'),
  ('a0000000-0000-0000-0000-00000000a003', 'finance_manager@test.local'),
  ('a0000000-0000-0000-0000-00000000a004', 'investor.a@test.local'),
  ('a0000000-0000-0000-0000-00000000a005', 'investor.b@test.local'),
  ('a0000000-0000-0000-0000-00000000a006', 'management@test.local');

insert into profiles (id, full_name, role) values
  ('a0000000-0000-0000-0000-00000000a001', 'Test Super Admin', 'super_admin'),
  ('a0000000-0000-0000-0000-00000000a002', 'Test Accounting', 'accounting'),
  ('a0000000-0000-0000-0000-00000000a003', 'Test Finance Manager', 'finance_manager'),
  ('a0000000-0000-0000-0000-00000000a004', 'Test Investor A', 'investor'),
  ('a0000000-0000-0000-0000-00000000a005', 'Test Investor B', 'investor'),
  ('a0000000-0000-0000-0000-00000000a006', 'Test Management', 'management');

insert into investors (id, investor_code, full_name, profile_id) values
  ('b0000000-0000-0000-0000-00000000b001', 'INV-TEST-A', 'Test Investor A', 'a0000000-0000-0000-0000-00000000a004'),
  ('b0000000-0000-0000-0000-00000000b002', 'INV-TEST-B', 'Test Investor B', 'a0000000-0000-0000-0000-00000000a005');

insert into outlets (id, entity_id, outlet_code, outlet_name) values
  ('c0000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000001', 'TEST-A', 'Test Outlet A'),
  ('c0000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000001', 'TEST-B', 'Test Outlet B');

insert into partnership_contracts (id, outlet_id, contract_number, start_date, end_date, profit_distribution_pct) values
  ('d0000000-0000-0000-0000-00000000d001', 'c0000000-0000-0000-0000-00000000c001', 'PKS-TEST-A', '2024-01-01', '2029-01-01', 70),
  ('d0000000-0000-0000-0000-00000000d002', 'c0000000-0000-0000-0000-00000000c002', 'PKS-TEST-B', '2024-01-01', '2029-01-01', 70);

insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date) values
  ('b0000000-0000-0000-0000-00000000b001', 'c0000000-0000-0000-0000-00000000c001', 'd0000000-0000-0000-0000-00000000d001', 100, '2024-01-01'),
  ('b0000000-0000-0000-0000-00000000b002', 'c0000000-0000-0000-0000-00000000c002', 'd0000000-0000-0000-0000-00000000d002', 100, '2024-01-01');

-- Published report for outlet A, draft (unpublished) for outlet B.
insert into pnl_reports (id, outlet_id, entity_id, accounting_period_id, revenue, cogs, operating_expense, status, published_at) values
  ('e0000000-0000-0000-0000-00000000e001', 'c0000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000001', 50000000, 10000000, 5000000, 'published', now()),
  ('e0000000-0000-0000-0000-00000000e002', 'c0000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000001', 40000000, 8000000, 4000000, 'draft', null);

insert into profit_distributions (id, outlet_id, accounting_period_id, pnl_report_id, contract_id,
                                   net_profit_snapshot, distribution_pct_snapshot, status) values
  ('f0000000-0000-0000-0000-00000000f001', 'c0000000-0000-0000-0000-00000000c001', '70000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-00000000e001', 'd0000000-0000-0000-0000-00000000d001', 35000000, 70, 'approved'),
  ('f0000000-0000-0000-0000-00000000f002', 'c0000000-0000-0000-0000-00000000c002', '70000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-00000000e002', 'd0000000-0000-0000-0000-00000000d002', 28000000, 70, 'approved');

insert into investor_profit_shares (profit_distribution_id, investor_id, ownership_pct_snapshot, share_amount) values
  ('f0000000-0000-0000-0000-00000000f001', 'b0000000-0000-0000-0000-00000000b001', 100, 24500000),
  ('f0000000-0000-0000-0000-00000000f002', 'b0000000-0000-0000-0000-00000000b002', 100, 19600000);
