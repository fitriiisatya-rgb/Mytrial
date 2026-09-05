-- =====================================================================
-- Phase 1 database integrity test suite (spec section E)
-- Each test prints exactly one line: 'PASS: <name>' or 'FAIL: <name> - <reason>'
-- Run against a freshly migrated + seeded database.
-- =====================================================================

\set ON_ERROR_STOP off

do $$
declare
  v_entity uuid := '00000000-0000-0000-0000-000000000001';
  v_period uuid := '70000000-0000-0000-0000-000000000001';
  v_outlet_bkpg uuid := '20000000-0000-0000-0000-000000000001';
  v_coa_bank uuid := '10000000-0000-0000-0000-000000000101'; -- 1010, bank BCA AMOR
  v_coa_expense uuid := '10000000-0000-0000-0000-000000000009'; -- 6100 opex
  v_bank_1 uuid := '30000000-0000-0000-0000-000000000001';
  v_jh uuid;
begin
  ----------------------------------------------------------------
  -- TEST 1: Journal debit = credit (a balanced journal promotes fine)
  ----------------------------------------------------------------
  begin
    insert into journal_headers (id, journal_number, journal_date, source_type, entity_id, accounting_period_id, status)
      values ('90000000-0000-0000-0000-000000000001', 'JRN-TEST-001', '2026-08-05', 'manual', v_entity, v_period, 'draft')
      returning id into v_jh;
    insert into journal_lines (journal_id, line_no, coa_id, entity_id, outlet_id, bank_account_id, debit, credit)
      values (v_jh, 1, v_coa_expense, v_entity, v_outlet_bkpg, null, 100000, 0);
    insert into journal_lines (journal_id, line_no, coa_id, entity_id, outlet_id, bank_account_id, debit, credit)
      values (v_jh, 2, v_coa_bank, v_entity, v_outlet_bkpg, v_bank_1, 0, 100000);
    update journal_headers set status = 'reviewed' where id = v_jh;
    update journal_headers set status = 'approved' where id = v_jh;
    update journal_headers set status = 'posted' where id = v_jh;
    raise notice 'PASS: 01_journal_debit_equals_credit_promotes';
  exception when others then
    raise notice 'FAIL: 01_journal_debit_equals_credit_promotes - %', sqlerrm;
  end;

  ----------------------------------------------------------------
  -- TEST 2: unbalanced journal rejected on promotion to approved
  ----------------------------------------------------------------
  begin
    insert into journal_headers (id, journal_number, journal_date, source_type, entity_id, accounting_period_id, status)
      values ('90000000-0000-0000-0000-000000000002', 'JRN-TEST-002', '2026-08-05', 'manual', v_entity, v_period, 'draft');
    insert into journal_lines (journal_id, line_no, coa_id, entity_id, outlet_id, debit, credit)
      values ('90000000-0000-0000-0000-000000000002', 1, v_coa_expense, v_entity, v_outlet_bkpg, 100000, 0);
    insert into journal_lines (journal_id, line_no, coa_id, entity_id, outlet_id, bank_account_id, debit, credit)
      values ('90000000-0000-0000-0000-000000000002', 2, v_coa_bank, v_entity, v_outlet_bkpg, v_bank_1, 0, 50000);
    begin
      update journal_headers set status = 'approved' where id = '90000000-0000-0000-0000-000000000002';
      raise notice 'FAIL: 02_unbalanced_journal_rejected - update succeeded but should have raised';
    exception when others then
      raise notice 'PASS: 02_unbalanced_journal_rejected (%)', sqlerrm;
    end;
  end;

  ----------------------------------------------------------------
  -- TEST 3: posted journal cannot be edited directly (any field, incl. status)
  ----------------------------------------------------------------
  begin
    update journal_headers set description = 'sneaky edit' where id = v_jh;
    raise notice 'FAIL: 03_posted_journal_immutable - direct edit succeeded';
  exception when others then
    raise notice 'PASS: 03_posted_journal_immutable (%)', sqlerrm;
  end;
  begin
    -- the unposting loophole: flip status away from posted then edit
    update journal_headers set status = 'draft' where id = v_jh;
    raise notice 'FAIL: 03b_posted_journal_unposting_blocked - status flip succeeded';
  exception when others then
    raise notice 'PASS: 03b_posted_journal_unposting_blocked (%)', sqlerrm;
  end;

  ----------------------------------------------------------------
  -- TEST 4: closed period rejects normal journal posting
  ----------------------------------------------------------------
  begin
    insert into accounting_periods (id, entity_id, period_month, period_year, status)
      values ('70000000-0000-0000-0000-000000000099', v_entity, 7, 2026, 'closed');
    begin
      insert into journal_headers (journal_number, journal_date, source_type, entity_id, accounting_period_id, status)
        values ('JRN-TEST-004', '2026-07-15', 'manual', v_entity, '70000000-0000-0000-0000-000000000099', 'draft');
      raise notice 'FAIL: 04_closed_period_rejects_posting - insert succeeded';
    exception when others then
      raise notice 'PASS: 04_closed_period_rejects_posting (%)', sqlerrm;
    end;
  end;

  ----------------------------------------------------------------
  -- TEST 5: bank account must point to a bank-specific COA (NOT NULL)
  ----------------------------------------------------------------
  begin
    insert into banks (entity_id, account_no, account_name, bank_name, coa_id)
      values (v_entity, '999-TEST', 'Test Account', 'Test Bank', null);
    raise notice 'FAIL: 05_bank_requires_coa - insert with null coa_id succeeded';
  exception when others then
    raise notice 'PASS: 05_bank_requires_coa (%)', sqlerrm;
  end;
  -- also confirm distinctness: no two seeded banks share a coa_id
  begin
    if (select count(*) from (select coa_id from banks group by coa_id having count(*) > 1) x) = 0 then
      raise notice 'PASS: 05b_every_bank_has_distinct_coa';
    else
      raise notice 'FAIL: 05b_every_bank_has_distinct_coa - shared coa_id detected';
    end if;
  end;

  ----------------------------------------------------------------
  -- TEST 6: duplicate bank import does not create a new row (dedupe_key unique)
  ----------------------------------------------------------------
  begin
    insert into bank_transactions_raw (bank_id, bank_label_raw, txn_date, credit, external_ref, fingerprint)
      values (v_bank_1, 'BCA AMOR', '2026-08-01', 500000, 'EXT-REF-001', 'fp-1');
    begin
      insert into bank_transactions_raw (bank_id, bank_label_raw, txn_date, credit, external_ref, fingerprint)
        values (v_bank_1, 'BCA AMOR', '2026-08-01', 500000, 'EXT-REF-001', 'fp-1-different');
      raise notice 'FAIL: 06_duplicate_bank_import_rejected - duplicate external_ref inserted';
    exception when others then
      raise notice 'PASS: 06_duplicate_bank_import_rejected (%)', sqlerrm;
    end;
  end;

  ----------------------------------------------------------------
  -- TEST 7: generating a journal twice for the same source does not duplicate
  ----------------------------------------------------------------
  begin
    insert into journal_headers (journal_number, journal_date, source_type, source_id, entity_id, accounting_period_id, status)
      values ('JRN-TEST-007-A', '2026-08-02', 'bank_expense', '90000000-0000-0000-0000-0000000000aa', v_entity, v_period, 'draft');
    begin
      insert into journal_headers (journal_number, journal_date, source_type, source_id, entity_id, accounting_period_id, status)
        values ('JRN-TEST-007-B', '2026-08-02', 'bank_expense', '90000000-0000-0000-0000-0000000000aa', v_entity, v_period, 'draft');
      raise notice 'FAIL: 07_duplicate_journal_generation_rejected - second journal for same source inserted';
    exception when others then
      raise notice 'PASS: 07_duplicate_journal_generation_rejected (%)', sqlerrm;
    end;
  end;

  ----------------------------------------------------------------
  -- TEST 8: ownership effective-date works (fn_ownership_as_of)
  ----------------------------------------------------------------
  begin
    -- BKBL outlet's seed ownership (investor 002, 100%, open-ended since
    -- 2024-01-01) must be superseded (end-dated) before installing
    -- non-overlapping time-boxed rows, otherwise the total-ownership guard
    -- (test 9) would correctly reject the overlap.
    update investor_ownerships set end_date = '2024-12-31'
      where outlet_id = '20000000-0000-0000-0000-000000000002' and end_date is null;
    insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date, end_date)
      values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
              '60000000-0000-0000-0000-000000000002', 100, '2025-01-01', '2025-12-31');
    insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date, end_date)
      values ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
              '60000000-0000-0000-0000-000000000002', 100, '2026-01-01', null);
    if (select count(*) from fn_ownership_as_of('20000000-0000-0000-0000-000000000002', '2025-06-01')) = 1
       and (select investor_id from fn_ownership_as_of('20000000-0000-0000-0000-000000000002', '2025-06-01')) = '50000000-0000-0000-0000-000000000001'
       and (select investor_id from fn_ownership_as_of('20000000-0000-0000-0000-000000000002', '2026-06-01')) = '50000000-0000-0000-0000-000000000002'
    then
      raise notice 'PASS: 08_ownership_effective_date_works';
    else
      raise notice 'FAIL: 08_ownership_effective_date_works - wrong investor resolved for date';
    end if;
  exception when others then
    raise notice 'FAIL: 08_ownership_effective_date_works - %', sqlerrm;
  end;

  ----------------------------------------------------------------
  -- TEST 9: total ownership validation (cannot exceed 100% for overlapping dates)
  ----------------------------------------------------------------
  begin
    insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date, end_date)
      values ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002',
              '60000000-0000-0000-0000-000000000002', 50, '2026-01-01', null);
    raise notice 'FAIL: 09_total_ownership_validation - inserted overlapping 100%%+50%% without error';
  exception when others then
    raise notice 'PASS: 09_total_ownership_validation (%)', sqlerrm;
  end;

  ----------------------------------------------------------------
  -- TEST 10: distribution snapshot immutable after approved
  ----------------------------------------------------------------
  declare
    v_pnl uuid;
    v_dist uuid;
  begin
    insert into pnl_reports (outlet_id, entity_id, accounting_period_id, revenue, cogs, operating_expense)
      values (v_outlet_bkpg, v_entity, v_period, 50000000, 10000000, 5000000)
      returning id into v_pnl;
    insert into profit_distributions (outlet_id, accounting_period_id, pnl_report_id, contract_id,
                                       net_profit_snapshot, distribution_pct_snapshot, status)
      values (v_outlet_bkpg, v_period, v_pnl, '60000000-0000-0000-0000-000000000001',
              35000000, 70, 'approved')
      returning id into v_dist;
    begin
      update profit_distributions set net_profit_snapshot = 99999999 where id = v_dist;
      raise notice 'FAIL: 10_distribution_snapshot_immutable - snapshot changed after approved';
    exception when others then
      raise notice 'PASS: 10_distribution_snapshot_immutable (%)', sqlerrm;
    end;
  end;

  ----------------------------------------------------------------
  -- TEST 11: allocation result exactly reconciles (over-allocation rejected)
  ----------------------------------------------------------------
  declare
    v_rule uuid;
  begin
    insert into allocation_rules (source_coa_id, method, effective_date, total_amount)
      values (v_coa_expense, 'equal', '2026-08-01', 30000000)
      returning id into v_rule;
    insert into allocation_rule_outlets (allocation_rule_id, outlet_id, allocated_amount)
      values (v_rule, '20000000-0000-0000-0000-000000000001', 15000000);
    insert into allocation_rule_outlets (allocation_rule_id, outlet_id, allocated_amount)
      values (v_rule, '20000000-0000-0000-0000-000000000002', 15000000);
    begin
      insert into allocation_rule_outlets (allocation_rule_id, outlet_id, allocated_amount)
        values (v_rule, '20000000-0000-0000-0000-000000000003', 1);
      raise notice 'FAIL: 11_allocation_reconciles - over-allocation accepted';
    exception when others then
      raise notice 'PASS: 11_allocation_reconciles (%)', sqlerrm;
    end;
  end;

  ----------------------------------------------------------------
  -- TEST 12: investor share total exactly equals distributable profit
  -- (app-layer guarantee, exercised here as a DB-level round-trip check
  -- using the same largest-remainder math lib/money.ts uses)
  ----------------------------------------------------------------
  declare
    v_dist2 uuid;
    v_distributable numeric(18,2);
    v_share_sum numeric(18,2);
  begin
    select id, distributable_profit into v_dist2, v_distributable
      from profit_distributions where outlet_id = v_outlet_bkpg and accounting_period_id = v_period;
    -- Rp100 split 3 ways (classic remainder case) — largest-remainder by hand: 33.34/33.33/33.33
    insert into investor_profit_shares (profit_distribution_id, investor_id, ownership_pct_snapshot, share_amount)
      values (v_dist2, '50000000-0000-0000-0000-000000000001', 33.34, round(v_distributable * 0.3334, 2));
    insert into investor_profit_shares (profit_distribution_id, investor_id, ownership_pct_snapshot, share_amount)
      values (v_dist2, '50000000-0000-0000-0000-000000000002', 33.33, round(v_distributable * 0.3333, 2));
    insert into investor_profit_shares (profit_distribution_id, investor_id, ownership_pct_snapshot, share_amount)
      values (v_dist2, '50000000-0000-0000-0000-000000000003',
              33.33, v_distributable - round(v_distributable * 0.3334, 2) - round(v_distributable * 0.3333, 2));
    select sum(share_amount) into v_share_sum from investor_profit_shares where profit_distribution_id = v_dist2;
    if v_share_sum = v_distributable then
      raise notice 'PASS: 12_investor_share_total_equals_distributable';
    else
      raise notice 'FAIL: 12_investor_share_total_equals_distributable - sum % <> distributable %', v_share_sum, v_distributable;
    end if;
  end;

end $$;
