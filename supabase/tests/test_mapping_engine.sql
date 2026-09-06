-- =====================================================================
-- Phase 4 Mapping Engine test suite — exercises what only a real
-- database can prove for migration 0010: the two new exception_type
-- enum values, the new bank_transactions_raw columns (matched rule FKs,
-- shared-cost flag, mapped_at), the mapping_runs table + its RLS, and
-- the exceptions table's (source_table, source_id) unique constraint
-- actually rejecting a second exception for the same row. Rule
-- matching/priority/specificity/ambiguity/learning/similar-transaction
-- logic itself is unit-tested in lib/mapping/__tests__/*.test.ts (40
-- tests) — this suite proves the schema honors what that logic assumes.
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

\echo '--- 1. new exception_type enum values are accepted ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a002'); -- accounting
  do $$
  declare v_bank uuid; v_batch uuid; v_row uuid;
  begin
    select id into v_bank from banks where account_no = '352-3722227';
    insert into import_batches (source, source_name, entity_id, imported_by, row_count, status)
      values ('csv_upload', 'mapping_test.csv', '00000000-0000-0000-0000-000000000001',
              'a0000000-0000-0000-0000-00000000a002', 1, 'processing')
      returning id into v_batch;
    insert into bank_transactions_raw (import_batch_id, bank_id, bank_label_raw, txn_date, credit, debit,
                                        classification_raw, description_raw, fingerprint)
      values (v_batch, v_bank, 'BCA AMOR 352-3722227', '2026-03-01', 3500, 0,
              'Mutasi antar unit', 'Pindah dana ke outlet lain', 'fp-mapping-1')
      returning id into v_row;
    insert into exceptions (source_table, source_id, exception_type, status)
      values ('bank_transactions_raw', v_row, 'interbank_transfer', 'open');
    raise notice 'PASS: 01a_interbank_transfer_exception_type_accepted';
  exception when others then
    raise notice 'FAIL: 01a_interbank_transfer_exception_type_accepted - %', sqlerrm;
  end $$;

  do $$
  declare v_bank uuid; v_batch uuid; v_row uuid;
  begin
    select id into v_bank from banks where account_no = '352-3722227';
    select id into v_batch from import_batches where source_name = 'mapping_test.csv';
    insert into bank_transactions_raw (import_batch_id, bank_id, bank_label_raw, txn_date, credit, debit,
                                        classification_raw, description_raw, fingerprint)
      values (v_batch, v_bank, 'BCA AMOR 352-3722227', '2026-03-02', 500000, 0,
              'Biaya Bersama Kantor Pusat', 'Overhead seluruh outlet', 'fp-mapping-2')
      returning id into v_row;
    insert into exceptions (source_table, source_id, exception_type, status)
      values ('bank_transactions_raw', v_row, 'shared_cost_candidate', 'open');
    raise notice 'PASS: 01b_shared_cost_candidate_exception_type_accepted';
  exception when others then
    raise notice 'FAIL: 01b_shared_cost_candidate_exception_type_accepted - %', sqlerrm;
  end $$;

  do $$
  declare v_bank uuid; v_batch uuid; v_row uuid;
  begin
    select id into v_bank from banks where account_no = '352-3722227';
    select id into v_batch from import_batches where source_name = 'mapping_test.csv';
    insert into bank_transactions_raw (import_batch_id, bank_id, bank_label_raw, txn_date, credit, debit,
                                        classification_raw, fingerprint)
      values (v_batch, v_bank, 'BCA AMOR 352-3722227', '2026-03-03', 100000, 0, 'Marketing', 'fp-mapping-3')
      returning id into v_row;
    insert into exceptions (source_table, source_id, exception_type, status)
      values ('bank_transactions_raw', v_row, 'ambiguous_mapping', 'open');
    raise notice 'PASS: 01c_ambiguous_mapping_exception_type_accepted';
  exception when others then
    raise notice 'FAIL: 01c_ambiguous_mapping_exception_type_accepted - %', sqlerrm;
  end $$;

  \echo '--- 2. exceptions unique(source_table, source_id) rejects a second exception for the same row ---'
  do $$
  declare v_row uuid;
  begin
    select source_id into v_row from exceptions where exception_type = 'interbank_transfer' and source_table = 'bank_transactions_raw'
      order by created_at desc limit 1;
    insert into exceptions (source_table, source_id, exception_type, status)
      values ('bank_transactions_raw', v_row, 'coa_not_detected', 'open');
    raise notice 'FAIL: 02_exceptions_unique_per_row - second exception for the same row was accepted';
  exception when unique_violation then
    raise notice 'PASS: 02_exceptions_unique_per_row (%)', sqlerrm;
  end $$;

  \echo '--- 3. matched_outlet_rule_id / matched_coa_rule_id are real FKs, not free-floating uuids ---'
  do $$
  declare v_bank uuid; v_batch uuid; v_outlet uuid; v_coa uuid; v_outlet_rule uuid; v_coa_rule uuid;
  begin
    select id into v_bank from banks where account_no = '352-3722227';
    select id into v_batch from import_batches where source_name = 'mapping_test.csv';
    select id into v_outlet from outlets where outlet_code = 'BKPG';
    select id into v_coa from coa where code = '1010';

    insert into outlet_mapping_rules (classification, output_outlet_id, priority)
      values ('Test Classification', v_outlet, 10) returning id into v_outlet_rule;
    insert into coa_mapping_rules (classification, result_coa_id, priority)
      values ('Test Classification', v_coa, 10) returning id into v_coa_rule;

    insert into bank_transactions_raw (import_batch_id, bank_id, bank_label_raw, txn_date, credit, debit,
                                        classification_raw, fingerprint, detected_outlet_id, detected_coa_id,
                                        matched_outlet_rule_id, matched_coa_rule_id, mapped_at)
      values (v_batch, v_bank, 'BCA AMOR 352-3722227', '2026-03-04', 250000, 0, 'Test Classification',
              'fp-mapping-4', v_outlet, v_coa, v_outlet_rule, v_coa_rule, now());
    raise notice 'PASS: 03a_matched_rule_columns_accept_real_rule_ids';
  exception when others then
    raise notice 'FAIL: 03a_matched_rule_columns_accept_real_rule_ids - %', sqlerrm;
  end $$;

  do $$
  declare v_bank uuid; v_batch uuid;
  begin
    select id into v_bank from banks where account_no = '352-3722227';
    select id into v_batch from import_batches where source_name = 'mapping_test.csv';
    insert into bank_transactions_raw (import_batch_id, bank_id, bank_label_raw, txn_date, credit, debit,
                                        fingerprint, matched_outlet_rule_id)
      values (v_batch, v_bank, 'BCA AMOR 352-3722227', '2026-03-05', 1000, 0, 'fp-mapping-5',
              '99999999-9999-9999-9999-999999999999');
    raise notice 'FAIL: 03b_matched_outlet_rule_id_rejects_bogus_id - insert succeeded';
  exception when foreign_key_violation then
    raise notice 'PASS: 03b_matched_outlet_rule_id_rejects_bogus_id (%)', sqlerrm;
  end $$;

  \echo '--- 4. is_shared_cost_candidate defaults false, mapped_at nullable ---'
  do $$
  declare v_bank uuid; v_batch uuid; v_flag boolean; v_mapped_at timestamptz;
  begin
    select id into v_bank from banks where account_no = '352-3722227';
    select id into v_batch from import_batches where source_name = 'mapping_test.csv';
    insert into bank_transactions_raw (import_batch_id, bank_id, bank_label_raw, txn_date, credit, debit, fingerprint)
      values (v_batch, v_bank, 'BCA AMOR 352-3722227', '2026-03-06', 2000, 0, 'fp-mapping-6')
      returning is_shared_cost_candidate, mapped_at into v_flag, v_mapped_at;
    if v_flag = false and v_mapped_at is null then
      raise notice 'PASS: 04_new_columns_default_correctly';
    else
      raise notice 'FAIL: 04_new_columns_default_correctly - flag=%, mapped_at=%', v_flag, v_mapped_at;
    end if;
  end $$;

  \echo '--- 5. mapping_runs scope check constraint ---'
  do $$
  begin
    insert into mapping_runs (scope, scope_id, triggered_by, trigger)
      values ('batch', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000a002', 'manual');
    raise notice 'PASS: 05a_mapping_runs_accepts_valid_scope';
  exception when others then
    raise notice 'FAIL: 05a_mapping_runs_accepts_valid_scope - %', sqlerrm;
  end $$;
  do $$
  begin
    insert into mapping_runs (scope, scope_id, trigger)
      values ('not_a_real_scope', '00000000-0000-0000-0000-000000000001', 'manual');
    raise notice 'FAIL: 05b_mapping_runs_rejects_invalid_scope - insert succeeded';
  exception when check_violation then
    raise notice 'PASS: 05b_mapping_runs_rejects_invalid_scope (%)', sqlerrm;
  end $$;

  \echo '--- 6. accounting can create/read outlet_mapping_rules, coa_mapping_rules, mapping_runs ---'
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from outlet_mapping_rules;
    if v_count >= 1 then raise notice 'PASS: 06_accounting_can_read_outlet_rules (% rows)', v_count;
    else raise notice 'FAIL: 06_accounting_can_read_outlet_rules - got 0 rows'; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from mapping_runs;
    if v_count >= 1 then raise notice 'PASS: 06_accounting_can_read_mapping_runs (% rows)', v_count;
    else raise notice 'FAIL: 06_accounting_can_read_mapping_runs - got 0 rows'; end if;
  end $$;
rollback;
\echo '--- rolled back: mapping engine schema test data never persisted ---'

\echo '--- 7. RLS: investor denied on outlet_mapping_rules and mapping_runs ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a004'); -- investor A
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from outlet_mapping_rules;
    if v_count = 0 then raise notice 'PASS: 07_investor_denied_outlet_mapping_rules';
    else raise notice 'FAIL: 07_investor_denied_outlet_mapping_rules - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from mapping_runs;
    if v_count = 0 then raise notice 'PASS: 07_investor_denied_mapping_runs';
    else raise notice 'FAIL: 07_investor_denied_mapping_runs - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  begin
    insert into mapping_runs (scope, scope_id, trigger) values ('entity', '00000000-0000-0000-0000-000000000001', 'manual');
    raise notice 'FAIL: 07_investor_cannot_create_mapping_run - insert succeeded';
  exception when others then
    raise notice 'PASS: 07_investor_cannot_create_mapping_run (%)', sqlerrm;
  end $$;
rollback;

\echo '--- 8. RLS: management also denied on mapping_runs (same staff-only set as import tables) ---'
begin;
  call test_as('a0000000-0000-0000-0000-00000000a006'); -- management
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from mapping_runs;
    if v_count = 0 then raise notice 'PASS: 08_management_denied_mapping_runs';
    else raise notice 'FAIL: 08_management_denied_mapping_runs - got % rows (leak)', v_count; end if;
  end $$;
  do $$
  declare v_count int;
  begin
    select count(*) into v_count from outlet_mapping_rules;
    if v_count = 0 then raise notice 'PASS: 08_management_denied_outlet_mapping_rules';
    else raise notice 'FAIL: 08_management_denied_outlet_mapping_rules - got % rows (leak)', v_count; end if;
  end $$;
rollback;
