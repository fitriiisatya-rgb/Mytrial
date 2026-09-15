-- =====================================================================
-- 0017 — AUTO JOURNAL & GENERAL LEDGER (Phase 5)
--
-- journal_headers/journal_lines already existed since 0005 with exactly
-- the workflow states this phase needs (draft/reviewed/approved/posted/
-- reversed), the balance-on-promotion guard, the posted-journal
-- immutability guard, and the period-lock guard. This migration is what
-- finally drives them: server-generated journal numbers, role-gated
-- workflow transition functions (the actual enforcement point — RLS
-- alone cannot express "accounting may review but only finance_manager
-- may approve/post"), a narrow, audited exception to posted-journal
-- immutability for the one sanctioned reversal path, idempotency scoped
-- to the *active* (non-reversed) journal per source, a stricter "no
-- 0/0 line" check journal_lines was missing, and the two new source-
-- specific tables (bank_transfers, and extending allocation_rules) that
-- interbank-transfer and shared-cost journals need.
--
-- Explicitly does not touch the Cashflow Management System module
-- (0010-0015) — no shared tables, no shared functions, no redesign.
-- =====================================================================

-- ---------------------------------------------------------------------
-- journal_headers: posted_by (spec G asked for it explicitly; posted_at
-- already existed but had no matching "who" column, unlike
-- reviewed_by/approved_by which both already exist).
-- ---------------------------------------------------------------------
alter table journal_headers add column posted_by uuid references profiles(id);

-- ---------------------------------------------------------------------
-- Idempotency (spec M): the plain unique(source_type, source_id) from
-- 0005 would permanently block ever generating a second journal for a
-- source once the first is reversed — but "regenerate after mapping
-- changed" (spec N) and "reverse + create corrected journal" (spec O)
-- both require exactly that. Replaced with a partial unique index that
-- only constrains the *active* (non-reversed) journal per source — a
-- reversed journal frees its source_id up for a fresh one, while two
-- simultaneously-active journals for the same source are still
-- impossible (test_integrity.sql's existing 07_duplicate_journal_
-- generation_rejected keeps passing unchanged: neither row in that test
-- is reversed).
-- ---------------------------------------------------------------------
alter table journal_headers drop constraint uq_journal_source;
create unique index uq_journal_source_active on journal_headers (source_type, source_id)
  where status <> 'reversed' and reversal_of_id is null;
comment on index uq_journal_source_active is
  'Idempotent journal generation (Phase 5 spec M): at most one non-reversed, '
  'non-reversal journal per (source_type, source_id). A reversal journal '
  '(reversal_of_id set) is a correction record, never itself "the" active '
  'journal for that source, so it is excluded here — otherwise the very '
  'act of reversing would permanently block ever generating a corrected '
  'journal for the same source. A reversed original also frees its source '
  'up for that corrected regeneration (spec N/O).';

-- ---------------------------------------------------------------------
-- journal_lines: "line tidak boleh 0/0" (spec H) — 0005 already blocks
-- debit>0 AND credit>0 together, but a line with BOTH at exactly zero
-- (contributing nothing) was still legal. A real line always moves a
-- real, positive, one-sided amount.
-- ---------------------------------------------------------------------
alter table journal_lines add constraint journal_lines_not_both_zero check (debit > 0 or credit > 0);

-- ---------------------------------------------------------------------
-- JOURNAL NUMBER (spec J): server-generated, concurrency-safe (a
-- sequence's nextval() is atomic under concurrent transactions — never
-- array length or any client-side counting), unique and deterministic
-- for audit. Only fills the column when the caller didn't already
-- supply one (manual override stays possible for data migration, but
-- every code path in this phase leaves it null and lets this assign it).
-- ---------------------------------------------------------------------
create sequence seq_journal_number start 1;
-- fn_assign_journal_number below runs as the calling (authenticated)
-- role, not the migration owner — a newly created sequence grants USAGE
-- to nobody but its owner by default, so without this an ordinary
-- accounting/finance_manager insert would fail with "permission denied
-- for sequence" the moment it tried to auto-assign a journal_number.
grant usage on sequence seq_journal_number to authenticated, service_role;

create or replace function fn_assign_journal_number() returns trigger as $$
begin
  if new.journal_number is null or new.journal_number = '' then
    new.journal_number := 'JRN-' || to_char(new.journal_date, 'YYYY-MM') || '-' || lpad(nextval('seq_journal_number')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_assign_journal_number before insert on journal_headers
  for each row execute function fn_assign_journal_number();

-- ---------------------------------------------------------------------
-- WORKFLOW ENFORCEMENT (spec K): backend + database, never a disabled
-- button. Every status change on journal_headers must go through one of
-- the four guarded functions below, which check role and current status
-- themselves before flipping a transaction-local flag this trigger
-- requires — the exact same pattern 0007's fn_publish_pnl/
-- fn_guard_pnl_publish already established for pnl_reports.
-- ---------------------------------------------------------------------
create or replace function fn_guard_journal_status_change() returns trigger as $$
begin
  if new.status is distinct from old.status then
    if coalesce(current_setting('myapp.allow_journal_status_change', true), 'false') <> 'true' then
      raise exception 'journal_headers.status can only change via fn_review_journal/fn_approve_journal/fn_post_journal/fn_reverse_journal.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_guard_journal_status_change
  before update on journal_headers
  for each row execute function fn_guard_journal_status_change();

-- Extend the existing posted-journal-immutability guard (0005) with the
-- one sanctioned exception: fn_reverse_journal flipping the ORIGINAL
-- posted journal's status to 'reversed' and nothing else on that same
-- row. Every other field must stay byte-identical, and the existing
-- tests (03_posted_journal_immutable: editing description still
-- rejected; 03b_posted_journal_unposting_blocked: flipping to 'draft'
-- still rejected, since that update never sets the flag and never
-- targets 'reversed') continue to pass unchanged.
create or replace function fn_block_posted_journal_edit() returns trigger as $$
begin
  if old.status = 'posted' then
    if coalesce(current_setting('myapp.allow_journal_status_change', true), 'false') = 'true'
       and new.status = 'reversed'
       and new.journal_number = old.journal_number
       and new.journal_date = old.journal_date
       and new.source_type = old.source_type
       and new.source_id is not distinct from old.source_id
       and new.batch_id is not distinct from old.batch_id
       and new.entity_id = old.entity_id
       and new.accounting_period_id = old.accounting_period_id
       and new.description is not distinct from old.description
       and new.created_by is not distinct from old.created_by
       and new.reviewed_by is not distinct from old.reviewed_by
       and new.reviewed_at is not distinct from old.reviewed_at
       and new.approved_by is not distinct from old.approved_by
       and new.approved_at is not distinct from old.approved_at
       and new.posted_by is not distinct from old.posted_by
       and new.posted_at = old.posted_at
       and new.reversal_of_id is not distinct from old.reversal_of_id
    then
      return new;
    end if;
    raise exception 'Posted journals cannot be edited directly. Use a reversal journal (source_type unchanged, reversal_of_id set).';
  end if;
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- fn_review_journal / fn_approve_journal / fn_post_journal: one guarded
-- step each, matching spec K's role split exactly (accounting reviews;
-- finance_manager/super_admin approve and post) and spec K's strict
-- Draft -> Reviewed -> Approved -> Posted sequence (each function only
-- accepts the one valid predecessor status — never a skip). Posting
-- additionally re-checks balance (belt-and-suspenders alongside 0005's
-- fn_check_journal_balanced_on_promotion, which fires on the same
-- UPDATE) and relies on the pre-existing fn_guard_period_lock trigger
-- (0005, fires on every journal_headers insert/update) to reject
-- posting into a closed/published period with its own, already-correct
-- error message — not duplicated here.
-- ---------------------------------------------------------------------
-- These take no actor parameter by design: `profiles` RLS only ever
-- lets a session read its OWN row (profile_self_read: id = auth.uid()),
-- so a plain `select role from profiles where id = p_actor` silently
-- returns NULL — and therefore always "unauthorized" — the moment
-- p_actor is anything other than the caller's own auth.uid(). Rather
-- than lean on that accident, these use auth_role()/auth.uid() directly
-- (auth_role() is SECURITY DEFINER, 0002 — the same escape hatch every
-- other role check in this schema already relies on), which is also
-- simply more correct: the actor performing the action is whoever is
-- authenticated right now, never a client-supplied id that could be
-- spoofed to attribute the action to someone else.
create or replace function fn_review_journal(p_journal_id uuid) returns void
language plpgsql as $$
declare v_role user_role; v_status journal_status; v_actor uuid := auth.uid();
begin
  v_role := auth_role();
  if v_role is null or v_role not in ('accounting','finance_manager','super_admin') then
    raise exception 'Role % is not authorized to review a journal.', v_role;
  end if;
  select status into v_status from journal_headers where id = p_journal_id;
  if v_status is null then raise exception 'Journal % not found.', p_journal_id; end if;
  if v_status <> 'draft' then
    raise exception 'Journal % is % — only a draft journal can be reviewed.', p_journal_id, v_status;
  end if;

  perform set_config('myapp.allow_journal_status_change', 'true', true);
  update journal_headers set status = 'reviewed', reviewed_by = v_actor, reviewed_at = now() where id = p_journal_id;

  insert into audit_log (user_id, action, entity_table, entity_id, old_value, new_value)
    values (v_actor, 'journal_reviewed', 'journal_headers', p_journal_id, jsonb_build_object('status','draft'), jsonb_build_object('status','reviewed'));
end;
$$;

create or replace function fn_approve_journal(p_journal_id uuid) returns void
language plpgsql as $$
declare v_role user_role; v_status journal_status; v_debit numeric(18,2); v_credit numeric(18,2); v_actor uuid := auth.uid();
begin
  v_role := auth_role();
  if v_role is null or v_role not in ('finance_manager','super_admin') then
    raise exception 'Role % is not authorized to approve a journal.', v_role;
  end if;
  select status into v_status from journal_headers where id = p_journal_id;
  if v_status is null then raise exception 'Journal % not found.', p_journal_id; end if;
  if v_status <> 'reviewed' then
    raise exception 'Journal % is % — only a reviewed journal can be approved.', p_journal_id, v_status;
  end if;

  select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_debit, v_credit from journal_lines where journal_id = p_journal_id;
  if v_debit <> v_credit then
    raise exception 'Journal % cannot be approved — not balanced (debit % <> credit %).', p_journal_id, v_debit, v_credit;
  end if;
  if v_debit = 0 then raise exception 'Journal % cannot be approved — it has no lines.', p_journal_id; end if;

  perform set_config('myapp.allow_journal_status_change', 'true', true);
  update journal_headers set status = 'approved', approved_by = v_actor, approved_at = now() where id = p_journal_id;

  insert into audit_log (user_id, action, entity_table, entity_id, old_value, new_value)
    values (v_actor, 'journal_approved', 'journal_headers', p_journal_id, jsonb_build_object('status','reviewed'), jsonb_build_object('status','approved'));
end;
$$;

create or replace function fn_post_journal(p_journal_id uuid) returns void
language plpgsql as $$
declare v_role user_role; v_status journal_status; v_debit numeric(18,2); v_credit numeric(18,2); v_actor uuid := auth.uid();
begin
  v_role := auth_role();
  if v_role is null or v_role not in ('finance_manager','super_admin') then
    raise exception 'Role % is not authorized to post a journal.', v_role;
  end if;
  select status into v_status from journal_headers where id = p_journal_id;
  if v_status is null then raise exception 'Journal % not found.', p_journal_id; end if;
  if v_status <> 'approved' then
    raise exception 'Journal % is % — only an approved journal can be posted.', p_journal_id, v_status;
  end if;

  select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_debit, v_credit from journal_lines where journal_id = p_journal_id;
  if v_debit <> v_credit then
    raise exception 'Journal % cannot be posted — not balanced (debit % <> credit %).', p_journal_id, v_debit, v_credit;
  end if;

  perform set_config('myapp.allow_journal_status_change', 'true', true);
  -- fn_guard_period_lock (0005) fires on this UPDATE too and rejects a
  -- closed/published period with its own message before we get here.
  update journal_headers set status = 'posted', posted_by = v_actor, posted_at = now() where id = p_journal_id;

  insert into audit_log (user_id, action, entity_table, entity_id, old_value, new_value)
    values (v_actor, 'journal_posted', 'journal_headers', p_journal_id, jsonb_build_object('status','approved'), jsonb_build_object('status','posted'));
end;
$$;

-- ---------------------------------------------------------------------
-- fn_reverse_journal (spec O): posted journals are never edited or
-- deleted. A reversal is created and IMMEDIATELY posted in the same
-- transaction as flipping the original to 'reversed' — never left as a
-- draft — because v_posted_journal_lines (0005) only shows status =
-- 'posted' rows; a draft reversal would open a window where GL/P&L
-- reflect neither the original nor its reversal. The reversal date's
-- accounting period must exist and be open/review (spec O: "reversal
-- date harus mengikuti accounting period policy") — resolved from the
-- original journal's entity, same as any other journal.
-- ---------------------------------------------------------------------
create or replace function fn_reverse_journal(p_journal_id uuid, p_reversal_date date, p_reason text)
returns uuid language plpgsql as $$
declare
  v_role user_role;
  v_actor uuid := auth.uid();
  v_orig journal_headers%rowtype;
  v_period_id uuid;
  v_new_id uuid;
begin
  v_role := auth_role();
  if v_role is null or v_role not in ('finance_manager','super_admin') then
    raise exception 'Role % is not authorized to reverse a journal.', v_role;
  end if;

  select * into v_orig from journal_headers where id = p_journal_id;
  if v_orig.id is null then raise exception 'Journal % not found.', p_journal_id; end if;
  if v_orig.status <> 'posted' then
    raise exception 'Journal % is % — only a posted journal can be reversed.', p_journal_id, v_orig.status;
  end if;

  select id into v_period_id from accounting_periods
    where entity_id = v_orig.entity_id
      and period_year = extract(year from p_reversal_date)
      and period_month = extract(month from p_reversal_date);
  if v_period_id is null then
    raise exception 'No accounting period exists for % in entity % — create it before reversing into this date.', p_reversal_date, v_orig.entity_id;
  end if;

  -- Flip the original to 'reversed' FIRST — uq_journal_source_active
  -- (partial unique on source_type/source_id excluding status='reversed')
  -- would otherwise collide with the reversal row below, which shares
  -- the exact same source_type/source_id by design. Both statements
  -- commit together as one transaction, so no external reader ever sees
  -- the momentary gap between this and the reversal's own posting a few
  -- statements later.
  perform set_config('myapp.allow_journal_status_change', 'true', true);
  update journal_headers set status = 'reversed' where id = p_journal_id;

  -- Reversal journal: created directly at 'posted' (bypasses the
  -- per-step guarded functions on purpose — this function IS the
  -- sanctioned privileged path, exactly like fn_publish_pnl bypassing
  -- pnl_reports' normal workflow). fn_guard_journal_status_change only
  -- fires on UPDATE, so this INSERT is unaffected by it; the promotion
  -- UPDATE right after it (draft -> posted) is what needs the flag.
  insert into journal_headers
    (journal_date, source_type, source_id, batch_id, entity_id, accounting_period_id, status, description, created_by, reversal_of_id)
    values
    (p_reversal_date, v_orig.source_type, v_orig.source_id, v_orig.batch_id, v_orig.entity_id, v_period_id, 'draft',
     coalesce(p_reason, 'Reversal of ' || v_orig.journal_number), v_actor, p_journal_id)
    returning id into v_new_id;

  insert into journal_lines (journal_id, line_no, coa_id, entity_id, outlet_id, bank_account_id, department_id, cost_center_id, debit, credit, description)
    select v_new_id, line_no, coa_id, entity_id, outlet_id, bank_account_id, department_id, cost_center_id, credit, debit, description
    from journal_lines where journal_id = p_journal_id;

  perform set_config('myapp.allow_journal_status_change', 'true', true);
  update journal_headers
    set status = 'posted', reviewed_by = v_actor, reviewed_at = now(), approved_by = v_actor, approved_at = now(), posted_by = v_actor, posted_at = now()
    where id = v_new_id;

  insert into audit_log (user_id, action, entity_table, entity_id, old_value, new_value)
    values (v_actor, 'journal_reversed', 'journal_headers', p_journal_id,
            jsonb_build_object('status','posted'),
            jsonb_build_object('status','reversed','reversal_journal_id', v_new_id));

  return v_new_id;
end;
$$;

-- No new trigger needed here: 0005's existing trg_block_posted_edit
-- trigger is bound to fn_block_posted_journal_edit() by name, so
-- CREATE OR REPLACE FUNCTION above already rewired it to the new logic
-- (same OID, new body) — Postgres re-resolves the function body on
-- every fire, it does not freeze the old definition.

-- =====================================================================
-- INTERBANK / INTERUNIT TRANSFER (spec E): a transfer never hits P&L —
-- it is tracked here as its own workflow, separate from a normal
-- expense, with an optional pairing suggestion to the matching debit
-- (incoming) row on a different bank account. `bank_transactions_raw`
-- already carries is_interbank_transfer (Phase 4); this table is the
-- transfer-specific bookkeeping (destination, pairing, journal link)
-- that column alone can't hold.
-- =====================================================================
create table bank_transfers (
  id                          uuid primary key default uuid_generate_v4(),
  source_transaction_id       uuid not null references bank_transactions_raw(id),
  source_bank_id              uuid not null references banks(id),
  destination_transaction_id  uuid references bank_transactions_raw(id),
  destination_bank_id         uuid references banks(id),
  amount                      numeric(18,2) not null check (amount > 0),
  transfer_date               date not null,
  -- unmatched: no destination candidate found at all.
  -- suggested: a candidate destination row was found automatically, not yet human-confirmed.
  -- confirmed: a human confirmed the pairing (or confirmed "no destination, use clearing").
  pairing_status              text not null default 'unmatched'
                                 check (pairing_status in ('unmatched','suggested','confirmed')),
  journal_id                  uuid references journal_headers(id),
  created_by                  uuid references profiles(id),
  created_at                  timestamptz not null default now(),
  unique (source_transaction_id)
);
create index idx_bank_transfers_pairing on bank_transfers (pairing_status) where pairing_status <> 'confirmed';

alter table bank_transfers enable row level security;
create policy staff_rw_bank_transfers on bank_transfers for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));

-- =====================================================================
-- SHARED COST ALLOCATION (spec F): extends 0006's allocation_rules with
-- a direct link back to the specific shared-cost bank_transactions_raw
-- row, so a shared-cost expense can be allocated straight from its
-- source row without first needing a separate clearing-account journal
-- step (0006's original source_journal_line_id path still works
-- unchanged for that other use case — this is additive, not a
-- replacement). source_coa_id (0006, not null) is the one expense COA
-- every allocated outlet line debits; allocation_rule_outlets (0006)
-- already carries the per-outlet split and the exact, remainder-safe
-- allocated_amount computed via lib/money.ts's allocateProportionally().
-- =====================================================================
alter table allocation_rules add column bank_transaction_id uuid references bank_transactions_raw(id);
create unique index uq_allocation_bank_transaction on allocation_rules (bank_transaction_id) where bank_transaction_id is not null;

-- =====================================================================
-- RLS for the phase's new/changed surface (spec Y): investor and
-- management get no policy on bank_transfers (same staff-only set as
-- journal_headers/journal_lines) — absence of a policy means denial
-- under RLS, the same convention every prior phase used. journal_headers/
-- journal_lines RLS is unchanged (0008 already denies investor/
-- management); the workflow functions above are the real authorization
-- boundary for *which* staff role may transition status, since RLS's
-- coarse "staff_rw_* for all" policy cannot itself distinguish review
-- from approve from post.
-- =====================================================================
