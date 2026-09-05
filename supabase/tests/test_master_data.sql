-- =====================================================================
-- Phase 2 Master Data UI smoke test — exercises the exact query/mutation
-- shapes used by app/master-data/*/page.tsx and actions.ts, as a real
-- authenticated 'accounting' role (not superuser), against the real
-- migrated schema. Confirms the embedded-relation selects the pages use
-- return the shape the TSX expects, and that inserts/updates go through
-- RLS + the ownership/allocation guards exactly as a live request would.
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

  \echo '--- outlets list query (outlets/page.tsx) ---'
  select outlet_code, outlet_name, active from outlets order by outlet_code limit 3;

  \echo '--- outlets create (outlets/actions.ts saveOutlet) ---'
  do $$
  declare v_id uuid;
  begin
    insert into outlets (entity_id, outlet_code, outlet_name, area)
      values ('00000000-0000-0000-0000-000000000001', 'SMOKE-01', 'Smoke Test Outlet', 'Jakarta')
      returning id into v_id;
    if v_id is not null then raise notice 'PASS: outlet_create_via_accounting_role';
    else raise notice 'FAIL: outlet_create_via_accounting_role - no id returned'; end if;
  exception when others then
    raise notice 'FAIL: outlet_create_via_accounting_role - %', sqlerrm;
  end $$;

  \echo '--- coa list + parent lookup (coa/page.tsx) ---'
  select code, name, account_type, normal_balance from coa order by code limit 3;

  \echo '--- banks create requires coa_id (banks/actions.ts saveBank) ---'
  do $$
  begin
    insert into banks (entity_id, account_no, account_name, bank_name, coa_id)
      values ('00000000-0000-0000-0000-000000000001', 'SMOKE-ACCT', 'Smoke Test', 'Bank Smoke',
              '10000000-0000-0000-0000-000000000101');
    raise notice 'PASS: bank_create_with_coa_via_accounting_role';
  exception when others then
    raise notice 'FAIL: bank_create_with_coa_via_accounting_role - %', sqlerrm;
  end $$;

  \echo '--- investors create (investors/actions.ts saveInvestor) ---'
  do $$
  begin
    insert into investors (investor_code, full_name, email, status)
      values ('INV-SMOKE', 'Smoke Investor', 'smoke@test.local', 'active');
    raise notice 'PASS: investor_create_via_accounting_role';
  exception when others then
    raise notice 'FAIL: investor_create_via_accounting_role - %', sqlerrm;
  end $$;

  \echo '--- contracts create + outlets(outlet_code) embed shape (contracts/page.tsx) ---'
  do $$
  declare v_outlet uuid;
  begin
    select id into v_outlet from outlets where outlet_code = 'SMOKE-01';
    insert into partnership_contracts (outlet_id, contract_number, start_date, end_date, profit_distribution_pct)
      values (v_outlet, 'PKS-SMOKE-01', '2026-01-01', '2029-01-01', 70);
    raise notice 'PASS: contract_create_via_accounting_role';
  exception when others then
    raise notice 'FAIL: contract_create_via_accounting_role - %', sqlerrm;
  end $$;

  \echo '--- ownerships create + total-ownership guard fires through the real insert shape ---'
  do $$
  declare v_outlet uuid; v_contract uuid; v_investor uuid;
  begin
    select id into v_outlet from outlets where outlet_code = 'SMOKE-01';
    select id into v_contract from partnership_contracts where contract_number = 'PKS-SMOKE-01';
    select id into v_investor from investors where investor_code = 'INV-SMOKE';
    insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date)
      values (v_investor, v_outlet, v_contract, 100, '2026-01-01');
    raise notice 'PASS: ownership_create_100pct_via_accounting_role';
    -- second investor at 1% overlapping the same outlet/date must be
    -- rejected by fn_check_ownership_total (0002), exactly as the
    -- ownerships/page.tsx form would trigger if submitted twice
    begin
      insert into investor_ownerships (investor_id, outlet_id, contract_id, ownership_pct, start_date)
        values ('50000000-0000-0000-0000-000000000001', v_outlet, v_contract, 1, '2026-01-01');
      raise notice 'FAIL: ownership_overallocation_still_rejected - insert succeeded';
    exception when others then
      raise notice 'PASS: ownership_overallocation_still_rejected (%)', sqlerrm;
    end;
  exception when others then
    raise notice 'FAIL: ownership_create_100pct_via_accounting_role - %', sqlerrm;
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
  select io.ownership_pct, i.investor_code, o.outlet_code, pc.contract_number
    from investor_ownerships io
    join investors i on i.id = io.investor_id
    join outlets o on o.id = io.outlet_id
    join partnership_contracts pc on pc.id = io.contract_id
    where i.investor_code = 'INV-SMOKE';

rollback;
\echo '--- rolled back: smoke test data never persisted ---'

\echo '--- management role: allowed on entities/outlets/coa/investors, blocked on banks/contracts/ownerships ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a006'); -- management
  do $$
  begin
    insert into outlets (entity_id, outlet_code, outlet_name) values
      ('00000000-0000-0000-0000-000000000001', 'MGMT-01', 'Management Test Outlet');
    raise notice 'PASS: management_can_write_outlets';
  exception when others then
    raise notice 'FAIL: management_can_write_outlets - %', sqlerrm;
  end $$;
  do $$
  begin
    insert into banks (entity_id, account_no, account_name, bank_name, coa_id) values
      ('00000000-0000-0000-0000-000000000001', 'MGMT-ACCT', 'x', 'x', '10000000-0000-0000-0000-000000000101');
    raise notice 'FAIL: management_cannot_write_banks - insert succeeded';
  exception when others then
    raise notice 'PASS: management_cannot_write_banks (%)', sqlerrm;
  end $$;
rollback;
