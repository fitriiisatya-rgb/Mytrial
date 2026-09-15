-- =====================================================================
-- Phase 5 Auto Journal & General Ledger test suite — exercises what
-- only a real database can prove for migration 0017: role-gated
-- workflow transitions (fn_review_journal/fn_approve_journal/
-- fn_post_journal/fn_reverse_journal), idempotent journal generation
-- (including regeneration after a reversal), reversal correctness
-- (exact opposite lines, link preserved, original marked reversed,
-- reversal itself already posted so GL never shows a gap), the new
-- journal_lines 0/0 check, server-generated journal numbers, manual
-- journal's null source_id never colliding, allocation_rules'
-- one-allocation-per-bank_transaction constraint, and RLS denial for
-- investor/management on journal_headers/bank_transfers. The journal-
-- building business logic itself (which COA goes where for each source
-- type, allocateProportionally reconciliation, transfer pairing
-- heuristics) is unit-tested in lib/journal/__tests__/*.test.ts (34
-- tests) — this suite proves the schema/workflow guards actually
-- enforce what that logic assumes. Everything here is rolled back — no
-- persisted state.
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

  \echo '--- 1. accounting can generate a draft journal, journal_number is server-assigned ---'
  do $$
  declare v_entity uuid; v_period uuid; v_coa_exp uuid; v_coa_bank uuid; v_jh uuid;
  begin
    select id into v_entity from entities limit 1;
    select id into v_period from accounting_periods where entity_id = v_entity limit 1;
    select id into v_coa_exp from coa where code = '6500';
    select id into v_coa_bank from coa where code = '1010';

    insert into journal_headers (id, journal_date, source_type, source_id, entity_id, accounting_period_id, status, created_by)
      values ('91000000-0000-0000-0000-000000000001', '2026-08-01', 'bank_expense', '92000000-0000-0000-0000-000000000001',
              v_entity, v_period, 'draft', 'a0000000-0000-0000-0000-00000000a002')
      returning id into v_jh;
    insert into journal_lines (journal_id, line_no, coa_id, entity_id, debit, credit) values (v_jh, 1, v_coa_exp, v_entity, 3500, 0);
    insert into journal_lines (journal_id, line_no, coa_id, entity_id, bank_account_id, debit, credit)
      values (v_jh, 2, v_coa_bank, v_entity, (select id from banks where account_no = '352-3722227'), 0, 3500);

    if (select journal_number from journal_headers where id = v_jh) like 'JRN-2026-08-%' then
      raise notice 'PASS: 01_draft_journal_generated_with_server_journal_number';
    else
      raise notice 'FAIL: 01_draft_journal_generated_with_server_journal_number';
    end if;
  end $$;

  \echo '--- 2. duplicate generate for the same source is prevented (idempotency) ---'
  do $$
  declare v_entity uuid; v_period uuid;
  begin
    select entity_id, accounting_period_id into v_entity, v_period from journal_headers where id = '91000000-0000-0000-0000-000000000001';
    insert into journal_headers (journal_date, source_type, source_id, entity_id, accounting_period_id, status, created_by)
      values ('2026-08-01', 'bank_expense', '92000000-0000-0000-0000-000000000001', v_entity, v_period, 'draft', 'a0000000-0000-0000-0000-00000000a002');
    raise notice 'FAIL: 02_duplicate_generate_prevented - second insert succeeded';
  exception when unique_violation then
    raise notice 'PASS: 02_duplicate_generate_prevented (%)', sqlerrm;
  end $$;

  \echo '--- 3. accounting can review, but cannot approve ---'
  do $$
  begin
    perform fn_review_journal('91000000-0000-0000-0000-000000000001');
    if (select status from journal_headers where id = '91000000-0000-0000-0000-000000000001') = 'reviewed' then
      raise notice 'PASS: 03a_accounting_can_review';
    else
      raise notice 'FAIL: 03a_accounting_can_review';
    end if;
  end $$;
  do $$
  begin
    perform fn_approve_journal('91000000-0000-0000-0000-000000000001');
    raise notice 'FAIL: 03b_accounting_cannot_approve - approve succeeded';
  exception when others then
    raise notice 'PASS: 03b_accounting_cannot_approve (%)', sqlerrm;
  end $$;

  \echo '--- 4. finance_manager can approve and post ---'
  call test_as('a0000000-0000-0000-0000-00000000a003'); -- finance_manager
  do $$
  begin
    perform fn_approve_journal('91000000-0000-0000-0000-000000000001');
    perform fn_post_journal('91000000-0000-0000-0000-000000000001');
    if (select status from journal_headers where id = '91000000-0000-0000-0000-000000000001') = 'posted' then
      raise notice 'PASS: 04_finance_manager_can_approve_and_post';
    else
      raise notice 'FAIL: 04_finance_manager_can_approve_and_post';
    end if;
  end $$;

  \echo '--- 5. accounting cannot post or reverse a journal ---'
  call test_as('a0000000-0000-0000-0000-00000000a002'); -- back to accounting
  do $$
  declare v_entity uuid; v_period uuid; v_coa_exp uuid; v_coa_bank uuid;
  begin
    select entity_id, accounting_period_id into v_entity, v_period from journal_headers where id = '91000000-0000-0000-0000-000000000001';
    select id into v_coa_exp from coa where code = '6500';
    select id into v_coa_bank from coa where code = '1010';
    insert into journal_headers (id, journal_date, source_type, source_id, entity_id, accounting_period_id, status, created_by)
      values ('91000000-0000-0000-0000-000000000002', '2026-08-02', 'manual', null, v_entity, v_period, 'draft', 'a0000000-0000-0000-0000-00000000a002');
    insert into journal_lines (journal_id, line_no, coa_id, entity_id, debit, credit) values ('91000000-0000-0000-0000-000000000002', 1, v_coa_exp, v_entity, 100, 0);
    insert into journal_lines (journal_id, line_no, coa_id, entity_id, debit, credit) values ('91000000-0000-0000-0000-000000000002', 2, v_coa_bank, v_entity, 0, 100);
    perform fn_review_journal('91000000-0000-0000-0000-000000000002');
  end $$;
  call test_as('a0000000-0000-0000-0000-00000000a003'); -- finance_manager approves it
  do $$
  begin
    perform fn_approve_journal('91000000-0000-0000-0000-000000000002');
  end $$;
  call test_as('a0000000-0000-0000-0000-00000000a002'); -- accounting tries to post — should fail
  do $$
  begin
    perform fn_post_journal('91000000-0000-0000-0000-000000000002');
    raise notice 'FAIL: 05a_accounting_cannot_post - post succeeded';
  exception when others then
    raise notice 'PASS: 05a_accounting_cannot_post (%)', sqlerrm;
  end $$;
  call test_as('a0000000-0000-0000-0000-00000000a003'); -- finance_manager actually posts it
  do $$
  begin
    perform fn_post_journal('91000000-0000-0000-0000-000000000002');
  end $$;
  call test_as('a0000000-0000-0000-0000-00000000a002'); -- accounting tries to reverse — should fail
  do $$
  begin
    perform fn_reverse_journal('91000000-0000-0000-0000-000000000002', '2026-08-02', null);
    raise notice 'FAIL: 05b_accounting_cannot_reverse - reverse succeeded';
  exception when others then
    raise notice 'PASS: 05b_accounting_cannot_reverse (%)', sqlerrm;
  end $$;

  \echo '--- 6. reversal creates exact opposite lines, links original, and is itself already posted ---'
  call test_as('a0000000-0000-0000-0000-00000000a003'); -- finance_manager
  do $$
  declare v_reversal_id uuid; v_orig_debit numeric; v_orig_credit numeric; v_rev_debit numeric; v_rev_credit numeric;
  begin
    select fn_reverse_journal('91000000-0000-0000-0000-000000000001', '2026-08-03', 'test reversal') into v_reversal_id;

    if (select status from journal_headers where id = '91000000-0000-0000-0000-000000000001') = 'reversed'
       and (select reversal_of_id from journal_headers where id = v_reversal_id) = '91000000-0000-0000-0000-000000000001'
       and (select status from journal_headers where id = v_reversal_id) = 'posted'
    then
      raise notice 'PASS: 06a_reversal_links_original_and_is_posted';
    else
      raise notice 'FAIL: 06a_reversal_links_original_and_is_posted';
    end if;

    select sum(debit), sum(credit) into v_orig_debit, v_orig_credit from journal_lines where journal_id = '91000000-0000-0000-0000-000000000001';
    select sum(debit), sum(credit) into v_rev_debit, v_rev_credit from journal_lines where journal_id = v_reversal_id;
    if v_rev_debit = v_orig_credit and v_rev_credit = v_orig_debit then
      raise notice 'PASS: 06b_reversal_lines_are_exact_opposite';
    else
      raise notice 'FAIL: 06b_reversal_lines_are_exact_opposite - orig(%,%) rev(%,%)', v_orig_debit, v_orig_credit, v_rev_debit, v_rev_credit;
    end if;
  end $$;

  \echo '--- 7. a corrected journal can be generated for the same source now that the original is reversed ---'
  do $$
  declare v_entity uuid; v_period uuid;
  begin
    select entity_id, accounting_period_id into v_entity, v_period from journal_headers where id = '91000000-0000-0000-0000-000000000001';
    insert into journal_headers (journal_date, source_type, source_id, entity_id, accounting_period_id, status, created_by)
      values ('2026-08-04', 'bank_expense', '92000000-0000-0000-0000-000000000001', v_entity, v_period, 'draft', 'a0000000-0000-0000-0000-00000000a002');
    raise notice 'PASS: 07_corrected_journal_after_reversal_succeeds';
  exception when others then
    raise notice 'FAIL: 07_corrected_journal_after_reversal_succeeds - %', sqlerrm;
  end $$;

  \echo '--- 8. two manual journals with null source_id never collide ---'
  do $$
  declare v_entity uuid; v_period uuid;
  begin
    select entity_id, accounting_period_id into v_entity, v_period from journal_headers where id = '91000000-0000-0000-0000-000000000001';
    insert into journal_headers (journal_date, source_type, source_id, entity_id, accounting_period_id, status, created_by)
      values ('2026-08-05', 'manual', null, v_entity, v_period, 'draft', 'a0000000-0000-0000-0000-00000000a002');
    insert into journal_headers (journal_date, source_type, source_id, entity_id, accounting_period_id, status, created_by)
      values ('2026-08-06', 'manual', null, v_entity, v_period, 'draft', 'a0000000-0000-0000-0000-00000000a002');
    raise notice 'PASS: 08_manual_journals_with_null_source_never_collide';
  exception when others then
    raise notice 'FAIL: 08_manual_journals_with_null_source_never_collide - %', sqlerrm;
  end $$;

  \echo '--- 9. a journal_lines 0/0 line is rejected at the schema level ---'
  do $$
  declare v_entity uuid; v_period uuid; v_coa_exp uuid; v_jh3 uuid;
  begin
    select entity_id, accounting_period_id into v_entity, v_period from journal_headers where id = '91000000-0000-0000-0000-000000000001';
    select id into v_coa_exp from coa where code = '6500';
    insert into journal_headers (journal_date, source_type, source_id, entity_id, accounting_period_id, status, created_by)
      values ('2026-08-07', 'manual', null, v_entity, v_period, 'draft', 'a0000000-0000-0000-0000-00000000a002') returning id into v_jh3;
    insert into journal_lines (journal_id, line_no, coa_id, entity_id, debit, credit) values (v_jh3, 1, v_coa_exp, v_entity, 0, 0);
    raise notice 'FAIL: 09_zero_zero_line_rejected - insert succeeded';
  exception when others then
    raise notice 'PASS: 09_zero_zero_line_rejected (%)', sqlerrm;
  end $$;

  \echo '--- 10. shared cost: one allocation per bank_transaction_id enforced ---'
  do $$
  declare v_coa_exp uuid; v_batch uuid; v_bank_txn uuid;
  begin
    select id into v_coa_exp from coa where code = '6500';
    insert into import_batches (source, row_count) values ('csv_upload', 1) returning id into v_batch;
    insert into bank_transactions_raw (import_batch_id, bank_id, bank_label_raw, txn_date, credit, debit, fingerprint)
      values (v_batch, (select id from banks limit 1), 'Test Bank', '2026-08-08', 100000, 0, 'fp-shared-cost-test')
      returning id into v_bank_txn;
    insert into allocation_rules (source_coa_id, method, effective_date, total_amount, bank_transaction_id, active)
      values (v_coa_exp, 'equal', '2026-08-08', 100000, v_bank_txn, true);
    begin
      insert into allocation_rules (source_coa_id, method, effective_date, total_amount, bank_transaction_id, active)
        values (v_coa_exp, 'equal', '2026-08-08', 100000, v_bank_txn, true);
      raise notice 'FAIL: 10_one_allocation_per_bank_transaction - second allocation accepted';
    exception when unique_violation then
      raise notice 'PASS: 10_one_allocation_per_bank_transaction (%)', sqlerrm;
    end;
  end $$;
rollback;
\echo '--- rolled back: auto journal test data never persisted ---'

\echo '--- 11. RLS: investor denied on journal_headers and bank_transfers ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a004'); -- investor A
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from journal_headers;
    if v_count = 0 then raise notice 'PASS: 11a_investor_denied_journal_headers';
    else raise notice 'FAIL: 11a_investor_denied_journal_headers - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from bank_transfers;
    if v_count = 0 then raise notice 'PASS: 11b_investor_denied_bank_transfers';
    else raise notice 'FAIL: 11b_investor_denied_bank_transfers - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  begin
    insert into bank_transfers (source_transaction_id, source_bank_id, amount, transfer_date)
      values (gen_random_uuid(), gen_random_uuid(), 1000, '2026-08-01');
    raise notice 'FAIL: 11c_investor_cannot_create_bank_transfer - insert succeeded';
  exception when others then
    raise notice 'PASS: 11c_investor_cannot_create_bank_transfer (%)', sqlerrm;
  end $$;
rollback;

\echo '--- 12. RLS: management also denied (same staff-only set as import/mapping tables) ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a006'); -- management
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from journal_headers;
    if v_count = 0 then raise notice 'PASS: 12a_management_denied_journal_headers';
    else raise notice 'FAIL: 12a_management_denied_journal_headers - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from bank_transfers;
    if v_count = 0 then raise notice 'PASS: 12b_management_denied_bank_transfers';
    else raise notice 'FAIL: 12b_management_denied_bank_transfers - got % rows (leak)', v_count; end if;
  end $$;
rollback;
