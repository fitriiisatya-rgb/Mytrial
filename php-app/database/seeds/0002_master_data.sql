-- =====================================================================
-- Phase 2 demo/dev seed data. Fixed UUIDs (same convention as
-- database/seeds/0001_core_foundation.sql and the original Postgres
-- supabase/seed.sql) so tests/Feature can reference rows deterministically.
-- Local/CI/demo use only - a real deployment enters its own real master
-- data through the UI, per CPANEL_DEPLOYMENT_NOTES.md.
-- =====================================================================

INSERT INTO entities (id, code, name, status) VALUES
  ('10000000-0000-0000-0000-000000000001', 'AMOR', 'PT Amor Group', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

INSERT INTO outlets (id, entity_id, code, name, area, opening_date, partnership_start, partnership_end, status) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'BKPG', 'Outlet Bekasi Pondok Gede', 'Bekasi', '2024-01-01', '2024-01-01', '2029-01-01', 'active'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'BKBL', 'Outlet Bekasi Bulak Kapal', 'Bekasi', '2024-03-01', '2024-03-01', '2029-03-01', 'active'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'KCRI', 'Outlet Kartini', 'Bekasi', '2024-06-01', '2024-06-01', '2029-06-01', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

INSERT INTO coa (id, code, name, account_type, parent_id, normal_balance, pnl_category, reporting_order, is_active) VALUES
  ('30000000-0000-0000-0000-000000000001', '100000', 'Assets', 'asset', NULL, 'debit', NULL, 100, 1),
  ('30000000-0000-0000-0000-000000000002', '101000', 'Kas & Bank', 'asset', '30000000-0000-0000-0000-000000000001', 'debit', NULL, 101, 1),
  ('30000000-0000-0000-0000-000000000003', '101101', 'BCA Operasional A', 'asset', '30000000-0000-0000-0000-000000000002', 'debit', NULL, 102, 1),
  ('30000000-0000-0000-0000-000000000004', '101102', 'BCA Operasional B', 'asset', '30000000-0000-0000-0000-000000000002', 'debit', NULL, 103, 1),
  ('30000000-0000-0000-0000-000000000005', '101103', 'Mandiri Operasional', 'asset', '30000000-0000-0000-0000-000000000002', 'debit', NULL, 104, 1),
  ('30000000-0000-0000-0000-000000000006', '400000', 'Revenue', 'revenue', NULL, 'credit', 'revenue', 400, 1),
  ('30000000-0000-0000-0000-000000000007', '600000', 'Operating Expenses', 'expense', NULL, 'debit', 'opex', 600, 1),
  ('30000000-0000-0000-0000-000000000008', '610000', 'Employee Expenses', 'expense', '30000000-0000-0000-0000-000000000007', 'debit', 'opex', 610, 1),
  ('30000000-0000-0000-0000-000000000009', '611000', 'Salary', 'expense', '30000000-0000-0000-0000-000000000008', 'debit', 'opex', 611, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active);

INSERT INTO banks (id, entity_id, bank_name, account_number, account_name, coa_id, is_active) VALUES
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'BCA', '111-2223330', 'PT Amor Group - Operasional A', '30000000-0000-0000-0000-000000000003', 1),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'BCA', '111-2223331', 'PT Amor Group - Operasional B', '30000000-0000-0000-0000-000000000004', 1),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Mandiri', '222-3334440', 'PT Amor Group - Operasional', '30000000-0000-0000-0000-000000000005', 1)
ON DUPLICATE KEY UPDATE bank_name = VALUES(bank_name), is_active = VALUES(is_active);

INSERT INTO investors (id, code, full_name, email, phone, profile_id, status) VALUES
  ('50000000-0000-0000-0000-000000000001', 'INV-001', 'Budi Santoso', 'budi@example.com', '0812-0000-0001', NULL, 'active'),
  ('50000000-0000-0000-0000-000000000002', 'INV-002', 'Siti Aminah', 'siti@example.com', '0812-0000-0002', 'a0000000-0000-0000-0000-00000000a005', 'active'),
  ('50000000-0000-0000-0000-000000000003', 'INV-003', 'Andi Wijaya', NULL, NULL, NULL, 'active')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), status = VALUES(status);

INSERT INTO partnership_contracts (id, outlet_id, contract_number, start_date, end_date, duration_months, total_investment, profit_distribution_pct, status) VALUES
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'PC-2024-001', '2024-01-01', '2029-01-01', 60, 500000000.00, 70.000, 'active'),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'PC-2024-002', '2024-03-01', '2029-03-01', 60, 350000000.00, 65.000, 'active')
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- Demonstrates effective-dated ownership history (spec J/H): investor
-- 001 held 20% of BKPG from contract start, then ownership changed to
-- 15% from 2027-01-01 onward - the OLD row is end-dated, never edited
-- in place; investor 002 fills the remaining 15% at BKPG throughout.
INSERT INTO investor_ownerships (id, investor_id, outlet_id, contract_id, ownership_pct, investment_amount, effective_from, effective_to, is_active) VALUES
  ('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 20.000000, 100000000.00, '2024-01-01', '2026-12-31', 0),
  ('70000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 15.000000, 75000000.00, '2027-01-01', NULL, 1),
  ('70000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 15.000000, 75000000.00, '2024-01-01', NULL, 1)
ON DUPLICATE KEY UPDATE ownership_pct = VALUES(ownership_pct);
