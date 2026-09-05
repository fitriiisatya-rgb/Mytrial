-- =====================================================================
-- SEED — master data only (Phase 1 scope). Bank transactions / revenue /
-- journals are seeded in Phase 3+ once the importer exists.
-- =====================================================================

insert into entities (id, code, name) values
  ('00000000-0000-0000-0000-000000000001', 'AMOR', 'Amor Group');

-- Chart of Accounts — includes one cash account PER BANK (correction #1),
-- not a single shared "Kas & Bank".
insert into coa (id, code, name, account_type, normal_balance, pnl_category) values
  ('10000000-0000-0000-0000-000000000001', '1090', 'Transfer Antar Bank/Unit (Clearing)', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000002', '1200', 'Piutang Talangan Franchise', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000003', '1210', 'Piutang Penjualan Belum Settle', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000004', '1500', 'Aset Tetap', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000005', '2100', 'Utang Bank / Angsuran', 'liability', 'credit', null),
  ('10000000-0000-0000-0000-000000000006', '3100', 'Prive Pemilik', 'equity', 'debit', null),
  ('10000000-0000-0000-0000-000000000007', '4000', 'Pendapatan Penjualan', 'revenue', 'credit', 'revenue'),
  ('10000000-0000-0000-0000-000000000008', '5000', 'HPP Bahan Baku', 'cogs', 'debit', 'cogs'),
  ('10000000-0000-0000-0000-000000000009', '6100', 'Beban Gaji', 'operating_expense', 'debit', 'opex'),
  ('10000000-0000-0000-0000-000000000010', '6110', 'Beban BPJS', 'operating_expense', 'debit', 'opex'),
  ('10000000-0000-0000-0000-000000000011', '6200', 'Beban Marketing', 'operating_expense', 'debit', 'opex'),
  ('10000000-0000-0000-0000-000000000012', '6300', 'Beban Listrik & Air', 'operating_expense', 'debit', 'opex'),
  ('10000000-0000-0000-0000-000000000013', '6310', 'Beban Internet & Telepon', 'operating_expense', 'debit', 'opex'),
  ('10000000-0000-0000-0000-000000000014', '6500', 'Beban Administrasi Bank', 'operating_expense', 'debit', 'opex'),
  ('10000000-0000-0000-0000-000000000015', '6600', 'Beban Pajak', 'operating_expense', 'debit', 'opex'),
  ('10000000-0000-0000-0000-000000000016', '6700', 'Beban Konsultan / Coaching', 'operating_expense', 'debit', 'opex'),
  ('10000000-0000-0000-0000-000000000017', '6800', 'Beban Lain-lain Operasional', 'operating_expense', 'debit', 'opex'),
  ('10000000-0000-0000-0000-000000000018', '7000', 'Pendapatan Lain-lain', 'other_income', 'credit', 'other_income'),
  -- one cash/bank COA per real rekening below
  ('10000000-0000-0000-0000-000000000101', '1010', 'Kas Bank — BCA AMOR 3722227', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000102', '1011', 'Kas Bank — BCA AMOR 1377494', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000103', '1012', 'Kas Bank — BCA Outlet 555', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000104', '1013', 'Kas Bank — Mandiri Outlet', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000105', '1014', 'Kas Bank — BCA CPKI 3521318269', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000106', '1015', 'Kas Bank — BCA KCRI 3525111', 'asset', 'debit', null),
  ('10000000-0000-0000-0000-000000000107', '1016', 'Kas Bank — BCA IKI 343352', 'asset', 'debit', null);

insert into outlets (id, entity_id, outlet_code, outlet_name, partnership_start, partnership_end) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'BKPG', 'Outlet Bekasi Pondok Gede', '2024-01-01', '2029-01-01'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'BKBL', 'Outlet Bekasi Bulak Kapal', '2024-01-01', '2029-01-01'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'CPRG', 'Outlet Ciparigi', '2024-01-01', '2029-01-01'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'BAROS', 'Outlet Baros', '2024-01-01', '2029-01-01'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'KCRI', 'Outlet Kartini', '2024-01-01', '2029-01-01');

-- Correction #1: coa_id mandatory and distinct per bank.
insert into banks (id, entity_id, account_no, account_name, bank_name, coa_id) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '352-3722227', 'AMOR', 'BCA AMOR 352-3722227', '10000000-0000-0000-0000-000000000101'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '352-1377494', 'AMOR', 'BCA AMOR 352-1377494', '10000000-0000-0000-0000-000000000102'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '555', 'OUTLET', 'BCA-Outlet 555', '10000000-0000-0000-0000-000000000103'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'OUTLET', 'OUTLET', 'Mandiri-Outlet', '10000000-0000-0000-0000-000000000104'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '3521318269', 'CPKI', 'BCA-CPKI-3521318269', '10000000-0000-0000-0000-000000000105'),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '352-3525111', 'KCRI', 'BCA KCRI 352-3525111', '10000000-0000-0000-0000-000000000106'),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '352-343352', 'IKI', 'BCA IKI 352-343352', '10000000-0000-0000-0000-000000000107');

-- Correction #3: revenue sources with configurable clearing account.
insert into revenue_sources (id, code, name, clearing_coa_id) values
  ('40000000-0000-0000-0000-000000000001', 'POS_CASH', 'Penjualan Tunai (POS)', '10000000-0000-0000-0000-000000000104'),
  ('40000000-0000-0000-0000-000000000002', 'QRIS_PENDING', 'QRIS / Payment Gateway (belum settle)', '10000000-0000-0000-0000-000000000003');

insert into investors (id, investor_code, full_name, email) values
  ('50000000-0000-0000-0000-000000000001', 'INV-A', 'Andi Wijaya', 'andi@example.com'),
  ('50000000-0000-0000-0000-000000000002', 'INV-B', 'Bunga Lestari', 'bunga@example.com'),
  ('50000000-0000-0000-0000-000000000003', 'INV-C', 'Citra Hartono', 'citra@example.com'),
  ('50000000-0000-0000-0000-000000000004', 'INV-D', 'Dedi Saputra', 'dedi@example.com');

insert into partnership_contracts (id, outlet_id, contract_number, start_date, end_date, profit_distribution_pct) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'PKS-BKPG-01', '2024-01-01', '2029-01-01', 70),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'PKS-BKBL-01', '2024-01-01', '2029-01-01', 65),
  ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'PKS-CPRG-01', '2024-01-01', '2029-01-01', 70),
  ('60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'PKS-BAROS-01', '2024-01-01', '2029-01-01', 60),
  ('60000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 'PKS-KCRI-01', '2024-01-01', '2029-01-01', 70);

insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 40, '2024-01-01'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 60, '2024-01-01'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 100, '2024-01-01'),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', 20, '2024-01-01'),
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', 30, '2024-01-01'),
  ('50000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', 50, '2024-01-01'),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000004', 100, '2024-01-01'),
  ('50000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000005', 45, '2024-01-01'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000005', 55, '2024-01-01');

insert into accounting_periods (id, entity_id, period_month, period_year, status) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 8, 2026, 'open');

-- Sanity check every outlet's ownership sums to 100% (fails the seed loudly
-- rather than silently letting bad data in).
do $$
declare r record;
begin
  for r in
    select outlet_id, sum(ownership_pct) as total
    from investor_ownerships where active group by outlet_id
  loop
    if r.total <> 100 then
      raise exception 'Outlet % ownership totals % (expected 100)', r.outlet_id, r.total;
    end if;
  end loop;
end $$;

-- =====================================================================
-- CASHFLOW MODULE SEED (0009+) — deliberately independent of the
-- accounting master data above. No FK to entities/coa/outlets.
-- =====================================================================

insert into cashflow_categories (code, name, type, is_internal_transfer, display_order) values
  ('SALES', 'Sales', 'CASH_IN', false, 10),
  ('REFUND_IN', 'Refund', 'CASH_IN', false, 20),
  ('INVESTOR_FUNDING', 'Investor/Funding', 'CASH_IN', false, 30),
  ('LOAN_IN', 'Loan', 'CASH_IN', false, 40),
  ('OTHER_INCOME', 'Other Income', 'CASH_IN', false, 50),
  ('TRANSFER_IN', 'Internal Transfer', 'CASH_IN', true, 60),
  ('SUPPLIER', 'Supplier', 'CASH_OUT', false, 10),
  ('PAYROLL', 'Payroll', 'CASH_OUT', false, 20),
  ('RENT', 'Rent', 'CASH_OUT', false, 30),
  ('UTILITIES', 'Utilities', 'CASH_OUT', false, 40),
  ('MARKETING', 'Marketing', 'CASH_OUT', false, 50),
  ('OPERATIONAL', 'Operational', 'CASH_OUT', false, 60),
  ('TAX', 'Tax', 'CASH_OUT', false, 70),
  ('CAPEX', 'Capex', 'CASH_OUT', false, 80),
  ('OTHER_EXPENSE', 'Other Expense', 'CASH_OUT', false, 90),
  ('TRANSFER_OUT', 'Internal Transfer', 'CASH_OUT', true, 100)
on conflict (code) do nothing;

-- Default sync/mapping configuration — editable later from
-- Settings > Google Sheet Sync without a redeploy.
insert into sync_config (key, value) values
  ('spreadsheet_id', '"1D6Hh7LCC9L2nRwqEguc5JLM9kOUl9WyTY3o4v5gs_RQ"'),
  ('sheet_name', '"Master"'),
  -- ASSUMPTION (documented): in "BUKU BANK" sheets, Debit = uang keluar
  -- (cash out), Kredit = uang masuk (cash in) — the standard Indonesian
  -- bank-book convention. Change to "debit_is_cash_in" if a sheet proves
  -- otherwise; the sync engine reads this key, never hardcodes polarity.
  ('debit_credit_polarity', '"debit_is_cash_out"'),
  ('header_row', '1'),
  ('stale_sync_hours', '24')
on conflict (key) do nothing;

insert into alert_rules (alert_type, bank_account_id, threshold_amount, threshold_hours) values
  ('LOW_BALANCE', null, 25000000, null),
  ('NEGATIVE_PROJECTED_BALANCE', null, 0, null),
  ('LARGE_PAYMENT', null, 100000000, null),
  ('RECONCILIATION_DIFFERENCE', null, 1, null),
  ('STALE_SYNC', null, null, 24);
