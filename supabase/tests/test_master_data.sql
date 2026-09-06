-- =====================================================================
-- Phase 2 Master Data UI test suite — exercises the exact query/mutation
-- shapes used by app/master-data/*/page.tsx and actions.ts, as real
-- authenticated roles (never superuser/service_role), against the real
-- migrated schema. Maps directly to PHASE2 spec section 16:
--   1. Create outlet success
--   2. Duplicate outlet code rejected
--   3. Bank without COA rejected
--   4. Management unauthorized bank mutation rejected
--   5. Accounting/super_admin authorized behavior per policy
--   6. Ownership <=100% success
--   7. Ownership >100% rejected
--   8. Historical ownership not overwritten
--   9. Investor without profile_id can still be created
--  10. Deactivation does not delete historical relations
-- Everything here is rolled back — no persisted state.
-- =====================================================================

\set ON_ERROR_STOP off

create or replace procedure test_as(p_uid uuid) language plpgsql as $$
begin
  execute format('set local role authenticated');
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

begin;
  call test_as('a0000000-0000-0000-0000-00000000a002'); -- accounting

  \echo '--- 1. Create outlet success (outlets/actions.ts saveOutlet) ---'
  do $$
  declare v_id uuid;
  begin
    insert into outlets (entity_id, outlet_code, outlet_name, area)
      values ('00000000-0000-0000-0000-000000000001', 'SMOKE-01', 'Smoke Test Outlet', 'Jakarta')
      returning id into v_id;
    if v_id is not null then raise notice 'PASS: 01_create_outlet_success';
    else raise notice 'FAIL: 01_create_outlet_success - no id returned'; end if;
  exception when others then
    raise notice 'FAIL: 01_create_outlet_success - %', sqlerrm;
  end $$;

  \echo '--- 2. Duplicate outlet code rejected (outlets_outlet_code_key) ---'
  do $$
  begin
    insert into outlets (entity_id, outlet_code, outlet_name)
      values ('00000000-0000-0000-0000-000000000001', 'SMOKE-01', 'Duplicate Code Outlet');
    raise notice 'FAIL: 02_duplicate_outlet_code_rejected - insert succeeded';
  exception when others then
    raise notice 'PASS: 02_duplicate_outlet_code_rejected (%)', sqlerrm;
  end $$;

  \echo '--- 3. Bank without COA rejected (banks.coa_id not null — Correction #1) ---'
  do $$
  begin
    insert into banks (entity_id, account_no, account_name, bank_name, coa_id)
      values ('00000000-0000-0000-0000-000000000001', 'SMOKE-NOCOA', 'x', 'x', null);
    raise notice 'FAIL: 03_bank_without_coa_rejected - insert succeeded';
  exception when others then
    raise notice 'PASS: 03_bank_without_coa_rejected (%)', sqlerrm;
  end $$;

  \echo '--- 5. Accounting authorized: bank WITH coa, investor, contract, ownership all succeed ---'
  do $$
  begin
    insert into banks (entity_id, account_no, account_name, bank_name, coa_id)
      values ('00000000-0000-0000-0000-000000000001', 'SMOKE-ACCT', 'Smoke Test', 'Bank Smoke',
              '10000000-0000-0000-0000-000000000101');
    raise notice 'PASS: 05_accounting_can_create_bank_with_coa';
  exception when others then
    raise notice 'FAIL: 05_accounting_can_create_bank_with_coa - %', sqlerrm;
  end $$;

  \echo '--- 9. Investor without profile_id can still be created (no invite flow yet) ---'
  do $$
  declare v_profile_id uuid;
  begin
    insert into investors (investor_code, full_name, email, status)
      values ('INV-SMOKE', 'Smoke Investor', 'smoke@test.local', 'active');
    select profile_id into v_profile_id from investors where investor_code = 'INV-SMOKE';
    if v_profile_id is null then raise notice 'PASS: 09_investor_without_profile_id_created';
    else raise notice 'FAIL: 09_investor_without_profile_id_created - profile_id was not null'; end if;
  exception when others then
    raise notice 'FAIL: 09_investor_without_profile_id_created - %', sqlerrm;
  end $$;

  do $$
  declare v_outlet uuid;
  begin
    select id into v_outlet from outlets where outlet_code = 'SMOKE-01';
    insert into partnership_contracts (outlet_id, contract_number, start_date, end_date, profit_distribution_pct)
      values (v_outlet, 'PKS-SMOKE-01', '2026-01-01', '2029-01-01', 70);
    raise notice 'PASS: 05_accounting_can_create_contract';
  exception when others then
    raise notice 'FAIL: 05_accounting_can_create_contract - %', sqlerrm;
  end $$;

  \echo '--- 6. Ownership <=100% success (60% then a further 40% — still exactly 100%, not over) ---'
  do $$
  declare v_outlet uuid; v_contract uuid; v_investor uuid;
  begin
    select id into v_outlet from outlets where outlet_code = 'SMOKE-01';
    select id into v_contract from partnership_contracts where contract_number = 'PKS-SMOKE-01';
    select id into v_investor from investors where investor_code = 'INV-SMOKE';
    insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date)
      values (v_investor, v_outlet, v_contract, 60, '2026-01-01');
    insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date)
      values ('50000000-0000-0000-0000-000000000002', v_outlet, v_contract, 40, '2026-01-01');
    raise notice 'PASS: 06_ownership_under_and_at_100pct_succeeds';
  exception when others then
    raise notice 'FAIL: 06_ownership_under_and_at_100pct_succeeds - %', sqlerrm;
  end $$;

  \echo '--- 7. Ownership >100% rejected (fn_check_ownership_total, 0002) ---'
  do $$
  declare v_outlet uuid; v_contract uuid;
  begin
    select id into v_outlet from outlets where outlet_code = 'SMOKE-01';
    select id into v_contract from partnership_contracts where contract_number = 'PKS-SMOKE-01';
    insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date)
      values ('50000000-0000-0000-0000-000000000003', v_outlet, v_contract, 1, '2026-01-01');
    raise notice 'FAIL: 07_ownership_over_100pct_rejected - insert succeeded';
  exception when others then
    raise notice 'PASS: 07_ownership_over_100pct_rejected (%)', sqlerrm;
  end $$;

  \echo '--- 8. Historical ownership not overwritten (fn_ownership_as_of stays correct after a newer row is added) ---'
  do $$
  declare v_outlet uuid; v_contract uuid; v_old_investor uuid; v_new_investor uuid; v_resolved uuid;
  begin
    -- deliberately a fresh outlet/contract, not SMOKE-01 — that one
    -- already carries the 60%+40% active rows from test 6, which would
    -- otherwise collide with the total-ownership guard here for reasons
    -- unrelated to what this test is actually checking.
    insert into outlets (entity_id, outlet_code, outlet_name)
      values ('00000000-0000-0000-0000-000000000001', 'SMOKE-08', 'Smoke Test Outlet 8')
      returning id into v_outlet;
    insert into partnership_contracts (outlet_id, contract_number, start_date, end_date, profit_distribution_pct)
      values (v_outlet, 'PKS-SMOKE-08', '2024-01-01', '2029-12-31', 70)
      returning id into v_contract;
    v_old_investor := '50000000-0000-0000-0000-000000000004';
    v_new_investor := '50000000-0000-0000-0000-000000000001';
    -- app/master-data/ownerships/actions.ts never updates ownership_pct/
    -- start_date/investor_id on an existing row (createOwnership is
    -- insert-only; endOwnership only ever touches end_date/active) — this
    -- proves the DB-level consequence of that: a 2025 snapshot is exactly
    -- who was in effect in 2025, unaffected by ending that row and adding
    -- a 2026 successor for the same outlet (mirrors the outlet used
    -- above, on a fresh date range to avoid the 100% guard).
    insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date, end_date, active)
      values (v_old_investor, v_outlet, v_contract, 100, '2025-01-01', '2025-12-31', false);
    insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date)
      values (v_new_investor, v_outlet, v_contract, 100, '2027-06-01');
    select investor_id into v_resolved from fn_ownership_as_of(v_outlet, '2025-06-01');
    if v_resolved = v_old_investor then
      raise notice 'PASS: 08_historical_ownership_not_overwritten';
    else
      raise notice 'FAIL: 08_historical_ownership_not_overwritten - resolved % instead of %', v_resolved, v_old_investor;
    end if;
  exception when others then
    raise notice 'FAIL: 08_historical_ownership_not_overwritten - %', sqlerrm;
  end $$;

  \echo '--- 10. Deactivation does not delete historical relations ---'
  do $$
  declare v_outlet uuid; v_ownership_count_before int; v_ownership_count_after int;
  begin
    select id into v_outlet from outlets where outlet_code = 'SMOKE-01';
    select count(*) into v_ownership_count_before from investor_ownerships where outlet_id = v_outlet;
    update outlets set active = false where id = v_outlet;
    select count(*) into v_ownership_count_after from investor_ownerships where outlet_id = v_outlet;
    if v_ownership_count_before > 0 and v_ownership_count_before = v_ownership_count_after then
      raise notice 'PASS: 10_deactivation_preserves_historical_relations (% rows intact)', v_ownership_count_after;
    else
      raise notice 'FAIL: 10_deactivation_preserves_historical_relations - % before, % after', v_ownership_count_before, v_ownership_count_after;
    end if;
  exception when others then
    raise notice 'FAIL: 10_deactivation_preserves_historical_relations - %', sqlerrm;
  end $$;

  \echo '--- embedded-relation select shapes (as the pages actually query them) ---'
  select o.outlet_code, e.name as entity_name
    from outlets o join entities e on e.id = o.entity_id
    where o.outlet_code = 'SMOKE-01';
  select b.bank_name, c.code as coa_code
    from banks b join coa c on c.id = b.coa_id
    where b.account_no = 'SMOKE-ACCT';
  select c.contract_number, o.outlet_code
    from partnership_contracts c join outlets o on o.id = c.outlet_id
    where c.contract_number = 'PKS-SMOKE-01';

rollback;
\echo '--- rolled back: smoke test data never persisted ---'

\echo '--- 5. Super admin: same authorized actions succeed too (broadest role) ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a001'); -- super_admin
  do $$
  begin
    insert into banks (entity_id, account_no, account_name, bank_name, coa_id) values
      ('00000000-0000-0000-0000-000000000001', 'SUPER-ACCT', 'x', 'x', '10000000-0000-0000-0000-000000000101');
    raise notice 'PASS: 05_super_admin_can_create_bank';
  exception when others then
    raise notice 'FAIL: 05_super_admin_can_create_bank - %', sqlerrm;
  end $$;
rollback;

\echo '--- Audit trail: accounting writes land and are visible to super_admin/finance_manager (staff_read_audit, 0008) — accounting itself has no read policy on audit_log, so lib/supabase/audit.ts writes succeed but a same-role read-back would see 0 rows; that is an existing Phase 1 RLS characteristic, not a Phase 2 regression ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a002'); -- accounting
  do $$
  declare v_id uuid;
  begin
    insert into outlets (entity_id, outlet_code, outlet_name)
      values ('00000000-0000-0000-0000-000000000001', 'AUDIT-01', 'Audit Test Outlet')
      returning id into v_id;
    insert into audit_log (user_id, action, entity_table, entity_id, new_value)
      values ('a0000000-0000-0000-0000-00000000a002', 'outlet_created', 'outlets', v_id, jsonb_build_object('outlet_code', 'AUDIT-01'));
  exception when others then
    raise notice 'FAIL: audit_log_write_on_outlet_create - %', sqlerrm;
  end $$;
  call test_as('a0000000-0000-0000-0000-00000000a001'); -- super_admin, same transaction
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from audit_log where action = 'outlet_created';
    if v_count = 1 then raise notice 'PASS: audit_log_write_on_outlet_create_visible_to_super_admin';
    else raise notice 'FAIL: audit_log_write_on_outlet_create_visible_to_super_admin - count %', v_count; end if;
  end $$;
rollback;

\echo '--- 4. Management: allowed on entities/outlets/coa/investors, blocked on banks/contracts/ownerships ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a006'); -- management
  do $$
  begin
    insert into outlets (entity_id, outlet_code, outlet_name) values
      ('00000000-0000-0000-0000-000000000001', 'MGMT-01', 'Management Test Outlet');
    raise notice 'PASS: 05_management_can_write_outlets';
  exception when others then
    raise notice 'FAIL: 05_management_can_write_outlets - %', sqlerrm;
  end $$;
  do $$
  begin
    insert into banks (entity_id, account_no, account_name, bank_name, coa_id) values
      ('00000000-0000-0000-0000-000000000001', 'MGMT-ACCT', 'x', 'x', '10000000-0000-0000-0000-000000000101');
    raise notice 'FAIL: 04_management_cannot_write_banks - insert succeeded';
  exception when others then
    raise notice 'PASS: 04_management_cannot_write_banks (%)', sqlerrm;
  end $$;
rollback;
