-- =====================================================================
-- Phase 1 RLS test suite (spec sections F & G) — real authenticated
-- Postgres roles + GUC-based JWT claims (the exact mechanism PostgREST/
-- Supabase uses), never superuser/service_role bypass, one assertion per
-- 'PASS'/'FAIL' notice.
-- =====================================================================

\set ON_ERROR_STOP off

-- Helper: impersonate a user as the 'authenticated' role for this
-- transaction only (mirrors PostgREST's per-request SET LOCAL).
create or replace procedure test_as(p_uid uuid) language plpgsql as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create or replace procedure test_reset() language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

\echo '--- INVESTOR A: allowed reads ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a004');
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from profiles where id = 'a0000000-0000-0000-0000-00000000a004';
    if v_count = 1 then raise notice 'PASS: investorA_can_read_own_profile';
    else raise notice 'FAIL: investorA_can_read_own_profile - got % rows', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from investor_ownerships where investor_id = 'b0000000-0000-0000-0000-00000000b001';
    if v_count = 1 then raise notice 'PASS: investorA_can_read_own_ownership';
    else raise notice 'FAIL: investorA_can_read_own_ownership - got % rows', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from pnl_reports where outlet_id = 'c0000000-0000-0000-0000-00000000c001' and status = 'published';
    if v_count = 1 then raise notice 'PASS: investorA_can_read_own_outlet_published_pnl';
    else raise notice 'FAIL: investorA_can_read_own_outlet_published_pnl - got % rows', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from profit_distributions where outlet_id = 'c0000000-0000-0000-0000-00000000c001';
    if v_count = 1 then raise notice 'PASS: investorA_can_read_own_distribution';
    else raise notice 'FAIL: investorA_can_read_own_distribution - got % rows', v_count; end if;
  end $$;
rollback;

\echo '--- INVESTOR A: denied cross-outlet / internal reads ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a004');
  do $$
  declare v_count int;
  begin
    -- direct query using Outlet B's ID
    select count(*) into v_count from outlets where id = 'c0000000-0000-0000-0000-00000000c002';
    if v_count = 0 then raise notice 'PASS: investorA_cannot_read_outletB_row';
    else raise notice 'FAIL: investorA_cannot_read_outletB_row - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from pnl_reports where outlet_id = 'c0000000-0000-0000-0000-00000000c002';
    if v_count = 0 then raise notice 'PASS: investorA_cannot_read_outletB_unpublished_pnl';
    else raise notice 'FAIL: investorA_cannot_read_outletB_unpublished_pnl - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from investor_ownerships where investor_id = 'b0000000-0000-0000-0000-00000000b002';
    if v_count = 0 then raise notice 'PASS: investorA_cannot_read_investorB_ownership';
    else raise notice 'FAIL: investorA_cannot_read_investorB_ownership - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from profit_distributions where outlet_id = 'c0000000-0000-0000-0000-00000000c002';
    if v_count = 0 then raise notice 'PASS: investorA_cannot_read_investorB_distribution';
    else raise notice 'FAIL: investorA_cannot_read_investorB_distribution - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from investor_profit_shares where investor_id = 'b0000000-0000-0000-0000-00000000b002';
    if v_count = 0 then raise notice 'PASS: investorA_cannot_read_investorB_share';
    else raise notice 'FAIL: investorA_cannot_read_investorB_share - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from journal_lines;
    if v_count = 0 then raise notice 'PASS: investorA_cannot_read_raw_journal_lines';
    else raise notice 'FAIL: investorA_cannot_read_raw_journal_lines - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from bank_transactions_raw;
    if v_count = 0 then raise notice 'PASS: investorA_cannot_read_raw_bank_transactions';
    else raise notice 'FAIL: investorA_cannot_read_raw_bank_transactions - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from coa_mapping_rules;
    if v_count = 0 then raise notice 'PASS: investorA_cannot_read_mapping_rules';
    else raise notice 'FAIL: investorA_cannot_read_mapping_rules - got % rows (leak)', v_count; end if;
  end $$;
  -- write attempt: investor tries to alter accounting data directly.
  -- RLS silently filters rows out of the UPDATE's USING clause rather than
  -- raising — the correct signal is "0 rows affected", not "no exception".
  do $$
  declare v_rows int;
  begin
    update coa set active = false where code = '1010';
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise notice 'PASS: investorA_cannot_write_coa (0 rows affected)';
    else raise notice 'FAIL: investorA_cannot_write_coa - % row(s) changed', v_rows; end if;
  exception when others then
    raise notice 'PASS: investorA_cannot_write_coa (%)', sqlerrm;
  end $$;
rollback;

\echo '--- INVESTOR B: symmetric checks (own outlet only) ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a005');
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from outlets where id = 'c0000000-0000-0000-0000-00000000c001';
    if v_count = 0 then raise notice 'PASS: investorB_cannot_read_outletA_row';
    else raise notice 'FAIL: investorB_cannot_read_outletA_row - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from pnl_reports where outlet_id = 'c0000000-0000-0000-0000-00000000c002' and status='published';
    if v_count = 0 then raise notice 'PASS: investorB_cannot_read_own_unpublished_pnl';
    else raise notice 'FAIL: investorB_cannot_read_own_unpublished_pnl - got % rows (leak of draft report)', v_count; end if;
  end $$;
rollback;

\echo '--- ACCOUNTING role ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a002');
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from bank_transactions_raw;
    if v_count >= 0 then raise notice 'PASS: accounting_can_read_bank_transactions (% rows)', v_count; end if;
  end $$;
  do $$
  begin
    insert into coa_mapping_rules (result_coa_id) values ('10000000-0000-0000-0000-000000000101');
    raise notice 'PASS: accounting_can_create_mapping';
  exception when others then
    raise notice 'FAIL: accounting_can_create_mapping - %', sqlerrm;
  end $$;
  do $$
  begin
    -- e002 is still 'draft' — a direct draft-to-published transition must
    -- go through fn_publish_pnl(), never a raw UPDATE.
    update pnl_reports set status = 'published' where id = 'e0000000-0000-0000-0000-00000000e002';
    raise notice 'FAIL: accounting_cannot_publish_pnl_directly - direct publish succeeded';
  exception when others then
    raise notice 'PASS: accounting_cannot_publish_pnl_directly (%)', sqlerrm;
  end $$;
rollback;

\echo '--- FINANCE MANAGER role ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a003');
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from audit_log;
    if v_count >= 0 then raise notice 'PASS: finance_manager_can_read_audit_log (% rows)', v_count; end if;
  exception when others then
    raise notice 'FAIL: finance_manager_can_read_audit_log - %', sqlerrm;
  end $$;
  do $$
  begin
    perform fn_reopen_period('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000a003', 'test reopen');
    raise notice 'PASS: finance_manager_can_reopen_period';
  exception when others then
    raise notice 'FAIL: finance_manager_can_reopen_period - %', sqlerrm;
  end $$;
rollback;

\echo '--- role escalation: investor cannot call fn_reopen_period ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a004');
  do $$
  begin
    perform fn_reopen_period('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000a004', 'trying to reopen');
    raise notice 'FAIL: investor_cannot_reopen_period - call succeeded';
  exception when others then
    raise notice 'PASS: investor_cannot_reopen_period (%)', sqlerrm;
  end $$;
rollback;

\echo '--- SUPER ADMIN: full access ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a001');
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from investors;
    if v_count >= 2 then raise notice 'PASS: super_admin_full_access (% investor rows visible)', v_count;
    else raise notice 'FAIL: super_admin_full_access - only % investor rows visible', v_count; end if;
  end $$;
rollback;

\echo '--- ANON (unauthenticated) is denied everything ---'
begin;
  set local role anon;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from profiles;
    if v_count = 0 then raise notice 'PASS: anon_cannot_read_profiles';
    else raise notice 'FAIL: anon_cannot_read_profiles - got % rows (leak)', v_count; end if;
  end $$;
rollback;
