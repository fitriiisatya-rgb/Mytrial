-- =====================================================================
-- 0010 — MAPPING ENGINE (Phase 4)
-- Outlet Mapping, COA Mapping, Ambiguous Mapping Detection, Exception
-- Center, Learning Mapping, Reprocess Engine, Shared Cost / Interbank
-- Candidate Detection, Rule Tester, Mapping Metrics.
--
-- Purely additive. outlet_mapping_rules / coa_mapping_rules / exceptions
-- already exist since 0004 with exactly the rule shape this phase needs
-- (bank_id/unit_value/classification/match_type/match_value/direction,
-- priority, active — see lib/mapping/rule-match.ts for how they're
-- evaluated). This migration only adds: the two exception_type labels
-- that didn't exist yet (ambiguous_mapping, shared_cost_candidate), a
-- handful of denormalized columns on bank_transactions_raw so a
-- dashboard/rule-metrics query never has to reverse-engineer "which rule
-- fired" from the exceptions table, and a new mapping_runs table that
-- gives the Reprocess Engine an audit trail (spec item 9) distinct from
-- import_batches (which tracks *imports*, not *mapping* runs — the same
-- batch can be reprocessed many times as rules are added).
--
-- Explicitly OUT of scope here (Phase 5 — Auto Journal): this migration
-- creates no journal_headers/journal_lines rows and no trigger writes
-- them. Mapping only ever sets detected_outlet_id/detected_coa_id/
-- is_interbank_transfer/is_shared_cost_candidate and raises exceptions
-- for human review — bank_transactions_raw.processed (0003) stays false
-- here; Phase 5 is what flips it once a journal exists.
-- =====================================================================

alter type exception_type add value if not exists 'ambiguous_mapping';
alter type exception_type add value if not exists 'shared_cost_candidate';

-- Denormalized mapping outcome on the raw row itself — same rationale as
-- 0003's exception_status column: fast dashboard/list queries without a
-- join, with the exceptions table remaining the source of truth for
-- anything requiring history (who resolved what, when, with what note).
alter table bank_transactions_raw
  add column matched_outlet_rule_id uuid references outlet_mapping_rules(id),
  add column matched_coa_rule_id    uuid references coa_mapping_rules(id),
  add column is_shared_cost_candidate boolean not null default false,
  add column mapped_at              timestamptz;

create index idx_bank_txn_matched_outlet_rule on bank_transactions_raw (matched_outlet_rule_id) where matched_outlet_rule_id is not null;
create index idx_bank_txn_matched_coa_rule on bank_transactions_raw (matched_coa_rule_id) where matched_coa_rule_id is not null;
create index idx_bank_txn_unmapped on bank_transactions_raw (credit) where credit > 0 and detected_outlet_id is null and not is_interbank_transfer;

-- =====================================================================
-- MAPPING RUNS — one row per Reprocess Engine invocation (manual
-- "Reprocess" click, or the automatic first pass right after a bank
-- expense import commit). Distinct from import_batches: a single
-- imported batch can be reprocessed many times as rules are added or
-- exceptions get bulk-resolved, and a reprocess can also span an entire
-- entity (not just one batch) once new rules are added retroactively.
-- =====================================================================
create table mapping_runs (
  id                       uuid primary key default uuid_generate_v4(),
  scope                    text not null check (scope in ('batch', 'entity')),
  scope_id                 uuid not null,       -- import_batches.id or entities.id, per `scope`
  triggered_by             uuid references profiles(id),
  trigger                  text not null default 'manual' check (trigger in ('manual', 'post_import')),
  started_at               timestamptz not null default now(),
  completed_at             timestamptz,
  rows_scanned             integer not null default 0,
  rows_outlet_mapped       integer not null default 0,
  rows_coa_mapped          integer not null default 0,
  rows_ambiguous           integer not null default 0,
  rows_interbank_candidate integer not null default 0,
  rows_shared_cost_candidate integer not null default 0,
  rows_exceptions_created  integer not null default 0,
  rows_exceptions_autoresolved integer not null default 0,
  created_at               timestamptz not null default now()
);
create index idx_mapping_runs_scope on mapping_runs (scope, scope_id);

alter table mapping_runs enable row level security;
-- Same staff set as import_batches/outlet_mapping_rules/coa_mapping_rules/
-- exceptions (0008) — mapping is operational bookkeeping for the same
-- people who run imports, never exposed to investors or management.
create policy staff_rw_mapping_runs on mapping_runs for all
  using (auth_role() in ('super_admin','accounting','finance_manager'));

comment on table mapping_runs is
  'Phase 4 Reprocess Engine audit trail — one row per mapping pass over '
  'a batch or entity. Rows_* columns are the exact numbers the Mapping '
  'Dashboard reports for that run; mapping_runs.completed_at null means '
  'the run is still in flight or crashed before finishing.';
