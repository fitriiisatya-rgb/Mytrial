# Phase 5 Validation Report — Auto Journal & General Ledger

Builds on Phases 1-4 (all PASS). One migration (`0017_auto_journal.sql`) extends the existing `journal_headers`/`journal_lines` tables (present since Phase 1's `0005_journal_gl.sql`) with the workflow, numbering, and idempotency machinery this phase needed, plus one new table (`bank_transfers`) and one new column (`allocation_rules.bank_transaction_id`). Nothing in Master Data, Import, Mapping Engine, RLS role model, or the **Cashflow Management System module** (migrations `0010`-`0015`) was redesigned, deleted, or modified — Phase 5 is strictly additive, per the constraint given at the start of this phase. Scope held to Auto Journal + General Ledger only, exactly as instructed.

## Journal Architecture

**Core pipeline** (spec A): Imported Transaction → Mapping Result (Phase 4) → Ready for Journal → Generate Journal Draft → Review → Approve → Post → General Ledger. Only `status = 'posted'` rows ever reach `v_posted_journal_lines` (Phase 1's pre-existing view) — the sole read path for General Ledger, Trial Balance, and eventually P&L (Phase 6). Every journal carries `source_type` + `source_id` (spec B): `bank_expense`, `revenue`, `allocation` (shared cost), `interbank_transfer`, `manual` — five sources, each with its own pure builder function in `lib/journal/`:

- `build-bank-expense-journal.ts`
- `build-revenue-journal.ts`
- `build-shared-cost-journal.ts`
- `build-interbank-transfer-journal.ts`
- `build-manual-journal.ts`

**One pure function, called from every entry point** — the same principle Phases 3-4 established for `classifyBankRows`/`mapBankTransaction`. Every builder takes plain inputs, returns a `JournalDraft` (header fields + `JournalLineDraft[]`), and self-validates balance via `checkBalance()` (`lib/journal/types.ts`) before returning — a builder that ever produced an unbalanced draft would be a bug in the builder, never something left for the database guard to catch first. `app/journal/actions.ts`'s `generateDraftJournals`, `generateSharedCostAllocation`, `suggestAndCreateTransfer`/`confirmTransfer`/`generateTransferJournal`, and `createManualJournal` all call these same functions — the UI, the bulk generator, and the 39 unit tests in `lib/journal/__tests__/*.test.ts` can never drift from each other.

## Bank Expense Journal (spec C)

`buildBankExpenseJournal()`: Dr the Mapping Engine's resolved expense COA (`detectedCoaId`) / Cr the bank's **own** dedicated COA (`banks.coa_id`) — never a generic Kas & Bank account. Every bank has carried a distinct `coa_id` since Phase 1 (re-confirmed live by `test_integrity.sql`'s `05b_every_bank_has_distinct_coa`). The credit line always stamps `bank_account_id` for reconciliation; `source_type`/`source_id`/`batch_id` are carried through for traceability (spec U). Outlet dimension flows through from the Mapping Engine's `detectedOutletId` on both lines (null only for `no_outlet_needed` COA rules, e.g. Prive/Angsuran — the same Phase 4 semantics, unchanged).

## Revenue Journal (spec D)

`buildRevenueJournal()`: Dr a configurable clearing/receivable COA (`revenue_sources.clearing_coa_id`, per revenue source — new FK-driven config, never hardcoded Dr Bank) / Cr the revenue COA the caller resolves for that source. Outlet dimension is set on **both** lines. This keeps revenue journal generation entirely config-driven: a new revenue source with a different settlement pattern (e.g. a payment gateway with its own receivable account vs. a walk-in cash sale) needs only a new `revenue_sources` row, never a code change.

## Shared Cost Journal (spec F)

A `shared_cost_candidate` row (Phase 4 heuristic) never journals straight to one outlet. It sits at `waiting_allocation` until an `allocation_rules` row (extended in this phase with `bank_transaction_id`, unique-per-transaction) supplies outlet weights. `buildSharedCostJournal()` then splits the total across N outlets via `lib/money.ts`'s `allocateEqually()`/`allocateProportionally()` (the same largest-remainder method Phase 1 already uses for profit-distribution splits — zero floating point, sum of shares always exactly equals the total) into N Dr lines (one per outlet, same expense COA) + one Cr line for the full amount against the bank's own COA. A zero-weight outlet is filtered out entirely rather than producing an invalid 0/0 line; fewer than 2 non-zero outlets left after filtering is rejected outright (not a real split).

## Interbank/Interunit Transfer (spec E)

Rows Phase 4 flags `interbank_candidate` **never** enter an expense P&L journal. `buildInterbankTransferJournal()` only ever touches bank-account COAs and, at worst, the seeded `1090 Transfer Antar Bank/Unit (Clearing)` balance-sheet COA — it never references an expense/revenue COA, so a transfer can structurally never leak into P&L. Dr the destination bank's own COA once paired (`bank_transfers.pairing_status = 'confirmed'`), otherwise Dr the transfer clearing account; Cr the source bank's own COA always. `lib/journal/transfer-pairing.ts`'s `suggestTransferPair()` proposes a pairing only on an **exact**-amount match, a different bank, within a configurable date window — it returns `null` (never guesses) on zero or 2+ ambiguous candidates. The `bank_transfers` table (new) tracks source/destination transaction, amount, date, and `pairing_status`; RLS-scoped identically to `journal_headers` (staff only).

## Manual Journal (spec P)

`/journal/manual`: Date, Period, Entity, Description, dynamic line rows (COA, Outlet optional, Debit, Credit, Description) via `components/journal/manual-journal-form.tsx`. `buildManualJournal()` is the one builder that returns `{ draft: null, errors: string[] }` instead of throwing — since its lines come directly from a human through the UI rather than a trusted pipeline, a validation failure (unbalanced, 0/0 line, negative amount) is expected input, not a bug, and the errors are shown back to the user. `source_type: 'manual'`, `source_id: null`. Follows the identical Draft → Reviewed → Approved → Posted workflow as every generated journal — no separate code path for promotion.

## Journal Workflow (spec K, G, H)

Reused `journal_headers`/`journal_lines` (Phase 1's `0005`) — this phase added only `posted_by`, a partial unique index, and a check constraint (see Idempotency and Journal Header sections). Status: `draft → reviewed → approved → posted`, plus `reversed`. Enforcement is **backend + trigger**, never just disabled buttons:

- `fn_review_journal(p_journal_id)` — role in (`accounting`, `finance_manager`, `super_admin`); source status must be `draft`.
- `fn_approve_journal(p_journal_id)` — role in (`finance_manager`, `super_admin`); source status must be `reviewed`; re-checks `sum(debit) = sum(credit)` and non-zero before promoting.
- `fn_post_journal(p_journal_id)` — same role gate; source status must be `approved`; re-checks balance; the pre-existing `fn_guard_period_lock` trigger (Phase 1, `0005`) fires on the same `UPDATE` and rejects a closed/published accounting period.
- `fn_reverse_journal(p_journal_id, p_reversal_date, p_reason)` — role in (`finance_manager`, `super_admin`); source status must be `posted`.

All four derive the actor from `auth_role()`/`auth.uid()` — **not** a client-supplied parameter (see Bugs Found & Fixed — this was a real design flaw caught and fixed during this phase). `fn_guard_journal_status_change()` (new `before update` trigger on `journal_headers`) blocks **any** status change outside these four functions, using the same "guarded function + transaction-local GUC flag" pattern Phase 1 established for P&L publishing. `fn_block_posted_journal_edit()` (Phase 1's existing function, re-wired via `CREATE OR REPLACE` — the pre-existing trigger picks up the new body automatically) still blocks a direct field edit or a status-flip-away-from-posted on any posted journal, with one narrow exception carved out for the reversal transition itself.

**Bulk workflow** (spec L): `bulkWorkflow()` in `app/journal/actions.ts` loops per-id over review/approve/post, collecting `{ succeeded: string[], failed: {id, error}[] }` — a failure on one journal is reported by id and reason, never silently skipped, and never blocks the rest of the batch. The Auto Journal list page's bulk-select checkboxes use the `form="bulk-journal-form"` HTML attribute (the same trick Phase 4's Exception Center used) so selection works outside the form's own DOM subtree.

## Idempotency (spec M)

`uq_journal_source_active`, a **partial unique index** on `journal_headers (source_type, source_id) where status <> 'reversed' and reversal_of_id is null`: running "Generate Journal" twice for the same source transaction hits this index on the second attempt. `insertJournalDraft()` in `actions.ts` catches Postgres `23505` specifically and reports `already_exists` (a safe no-op skip), never a hard failure — `generateDraftJournals`'s bulk run reports created/already_exists/failed per row, matching spec L's "never silently skip without detail." Journal numbering (spec J) uses a real Postgres sequence (`seq_journal_number`, `nextval()`) behind a `before insert` trigger producing `JRN-YYYY-MM-NNNNNN` — concurrency-safe and never array-length/frontend-counted; the sequence needed an explicit `GRANT USAGE` to the `authenticated` role (see Bugs Found & Fixed).

## Reversal (spec O) and Reprocess After Mapping Change (spec N)

A posted journal is never deleted or directly edited. `fn_reverse_journal()`: flips the original to `reversed`, inserts a new journal with debit/credit swapped on every line (`reversal_of_id` linking back), and posts the reversal **immediately, in the same transaction** — never left as a draft. This atomicity closes a real gap: since `v_posted_journal_lines` only shows `status = 'posted'` rows, a draft reversal would open a window where the original had disappeared from the GL but the reversal hadn't yet appeared. The reversal date resolves its own `accounting_period_id` per the entity/year/month and is rejected if no open period row exists for that date.

Reprocessing before Posted: a `draft`/`reviewed`/`approved` journal for a source can simply be regenerated (idempotency guard applies the same way). Reprocessing after Posted: the only path is Reverse → generate a corrected journal — enforced structurally, because `uq_journal_source_active` excludes `reversal_of_id is null` rows, so a reversal record itself never blocks a fresh corrected journal for the same source, while a second *simultaneously active* journal for that source is still rejected. Both behaviors are asserted live (`test_auto_journal.sql` tests 06-07).

## General Ledger & Trial Balance (spec Q, R, S)

`/journal/ledger` and `/journal/trial-balance` both read exclusively from `v_posted_journal_lines` (Phase 1's pre-existing view, `status = 'posted'` filter) — a draft/reviewed/approved journal is structurally invisible to both pages. Filters: period/date, entity, outlet, COA, bank account, source type. Rows are split into "before period start" (opening balance) vs. "within period" (period activity) in application code, then presented debit/credit/ending-balance per account. Sign presentation reads `coa.normal_balance` — never hardcoded by `account_type` — so a contra-asset or contra-revenue account (should one ever be configured) displays correctly without a code change. Trial Balance totals ending debit against ending credit; because every posted journal is individually guaranteed balanced (workflow + DB guard), the grand total is guaranteed to reconcile by construction — Trial Balance is the visible proof of that invariant, not a separate check that could disagree with it.

## Journal Detail & Source Traceability (spec W, U)

`/journal/[journalId]`: header (number, date, source, status, review/approve/post timestamps), lines (COA, account name, outlet, bank account, debit, credit, description), footer (total debit, total credit, difference — always 0 for anything that reached Approved/Posted). The detail page joins back to `bank_transactions_raw`/`revenue_transactions_raw`/`bank_transfers` by `source_id` to show the originating row, import batch, bank account, and — for a bank expense — the source file/sheet reference carried since Phase 3.

## RLS & Security (spec Y)

`bank_transfers`: new table, RLS-enabled, `staff_rw_bank_transfers` — the identical `super_admin`/`accounting`/`finance_manager` set as `journal_headers` (no `management`, no `investor` policy anywhere — absence of a policy denies under RLS). `journal_headers`/`journal_lines` themselves have carried the same staff-only policy since Phase 1's `0008`; this phase adds no new investor/management exposure to journal data or raw bank/revenue source rows, and both denials are re-confirmed live in this phase's own test file (tests 11a-12b), not merely assumed carried-over from Phase 1.

## Audit Trail (spec Z)

Every workflow transition (`journal_reviewed`, `journal_approved`, `journal_posted`, `journal_reversed`) is written to `audit_log` from inside the guarded SQL functions themselves — not from the client — so the audit record can never be skipped by an app-layer bug or a direct RPC call that bypasses the UI. Manual journal creation, bulk-workflow results, and transfer/allocation actions all call the existing `logAudit()` helper from `actions.ts`, the same helper every prior phase uses.

## Performance (spec AA)

`generateDraftJournals` batches its `bank_transactions_raw`/`revenue_transactions_raw` scan with a single filtered query per source table rather than N+1 row-by-row lookups; General Ledger and Trial Balance aggregate against the indexed `v_posted_journal_lines` view with period/entity/outlet/COA filters pushed into the query rather than pulled into JS first. `journal_headers(source_type, source_id)` and `journal_lines(journal_id)` both carry indexes from the partial-unique-index migration and Phase 1's original schema respectively. No new N+1 pattern was introduced; large-batch (10k+/100k+) load testing was not performed in this sandbox (no infrastructure for it here) and is called out below as a remaining risk, consistent with how Phase 3's "future 1M rows" note was handled.

## Real Data / Sanitized Fixture Validation (spec AC)

Run against `supabase/tests/fixtures/buku_bank_sanitized_pattern.csv` (the same sanitized regression fixture from Phase 4 — the real Buku Bank file is never committed to this repository), through the full Phase 3 → Phase 4 → Phase 5 pipeline using the same demonstration rule set as `PHASE4_VALIDATION_REPORT.md`:

```
Total expense_candidate rows (Phase 3):            13
Fully mapped, no exception (Phase 4):                7
Interbank transfer candidates (never P&L):           1
Shared cost candidates (waiting_allocation):         1
Unresolved exceptions (not ready for journal):       4

Transactions ready for journal:                      8
Draft journals generated (unique source keys):       8
Duplicates skipped (idempotent re-run simulation):   8
Balanced journals:                                   8
Unbalanced journals:                                 0
Failed journal generation:                           0
Shared cost rows waiting allocation:                 1
Interbank transfer queue (routed to clearing):       1

Total debit:   Rp 30,473,500.00
Total credit:  Rp 30,473,500.00
Total debit === total credit:  YES (exact match)
```

Bank-specific COA usage on every credit line was confirmed per-bank (5 distinct `banks.coa_id` values used across the 8 generated journals — never a generic account). The one `shared_cost_candidate` row (Rp 5,000,000, "Biaya Bersama Kantor Pusat") was additionally run through `buildSharedCostJournal()` with a 3-outlet equal split once a hypothetical allocation exists, producing a balanced journal (total debit = total credit = Rp 5,000,000.00) — demonstrating the waiting_allocation → allocated flow end-to-end without committing an allocation-rules row for a fixture that has none. This mirrors Phase 4's approach of proving the *pipeline* is correct against a synthetic, git-safe fixture, with the DB-level guarantees (idempotency via the real unique index, balance guard via the real trigger, 0/0 rejection via the real check constraint) separately proven live against real PostgreSQL in `test_auto_journal.sql`'s 18 assertions below.

## Bugs Found & Fixed

1. **Critical — actor-from-parameter design flaw in the workflow functions.** The original `fn_review_journal(p_journal_id, p_actor)` (and the other three) looked up the caller's role via `select role from profiles where id = p_actor`. Since `profiles` RLS only permits reading your own row (`id = auth.uid()`), this lookup silently returns `NULL` — and the function always raises "not authorized" — the instant `p_actor` differs from the session's own `auth.uid()`. In the real app path this was latent (the app always happened to pass the caller's own id), but it made the parameter both fragile and pointless, and mildly risky (a client could in principle try to pass a different actor id, which RLS would silently neuter into a rejection rather than reject cleanly and legibly). **Fixed** by removing `p_actor` from all four function signatures entirely and deriving the actor from `auth_role()` (Phase 1's `SECURITY DEFINER` self-identity function) and `auth.uid()` directly — the only correct way to know "who is calling" inside one of these guarded functions. Cascaded through the migration, `types/database.types.ts`, `app/journal/actions.ts`, and both SQL test files. Re-verified clean across a full rebuild.
2. **Reversal vs. the partial unique index — ordering.** Inserting the reversal row before flipping the original's status to `reversed` collided with `uq_journal_source_active`, since both rows briefly shared the same active `(source_type, source_id)`. **Fixed** by flipping the original first, then inserting the reversal, both inside the same transaction.
3. **Reversal permanently blocking a future corrected journal.** Even after fix #2, the newly-posted reversal itself shared the original's `(source_type, source_id)` and — being non-`reversed` status — counted as "the" active journal for that source under the index's first version, permanently blocking any future correction. **Fixed** by refining the index predicate to also exclude `reversal_of_id is not null` — a reversal is a correction record, never itself "the" journal for a source.
4. **Missing sequence grant.** `seq_journal_number` had no `USAGE` grant for the `authenticated` role — `ALTER DEFAULT PRIVILEGES ... ON TABLES` (from the auth emulation setup) does not cover sequences. Every real authenticated journal-number generation would have failed with `permission denied for sequence`. **Fixed** by adding an explicit `GRANT USAGE ON SEQUENCE ... TO authenticated, service_role`.
5. **Shared-cost weight/outlet field misalignment (caught in review, before running).** The allocation form's weight inputs shared one positional field name across all outlet checkboxes, which would misalign with `formData.getAll('outlet_id')` the moment any checkbox in the middle of the list was left unchecked. **Fixed** by keying each weight input uniquely per outlet (`weight_<outletId>`) and reading it by key rather than position.

## Remaining Risks

1. **Large-batch performance (10k+ mapped rows, 100k+ journals, 1M+ lines) was not load-tested** — no infrastructure for that scale in this sandbox. The query and indexing shape (batched scans, `v_posted_journal_lines` with pushed-down filters) is designed for it, but this is a proof of design, not a proof of measured throughput. Flagged for a real staging-scale test before very large production volumes.
2. **Transfer pairing suggestion is exact-amount, same-window only** — deliberately conservative (never guesses on ambiguity per spec E), but a real transfer that's split, rounded, or delayed beyond the date window will sit unpaired and route through the clearing account rather than auto-pairing. This is a reasonable, safe default; a fuzzier matching mode could be a follow-up if unpaired volume proves too high in practice.
3. **GL/Trial Balance opening-vs-period split runs in application code**, not a SQL aggregate — fine at the validated scale, same category of risk noted for Phase 4's mapping metrics.
4. **The demonstration mapping/allocation rule set used for fixture validation is illustrative**, not the real company's business rules — this phase proves the *journal engine* is correct against realistic inputs, not that a specific business's chart of rules is pre-loaded.

## Gate

- [x] Core pipeline: mapped transaction → draft → review → approve → post → GL, posted-only visibility
- [x] Five journal sources implemented, each with source_type + source_id
- [x] Bank Expense: Dr mapped expense COA / Cr bank's own COA (never generic), bank_account_id traceability
- [x] Revenue: Dr configurable clearing/receivable COA per revenue source, never hardcoded
- [x] Shared Cost: waiting_allocation until allocated, then exact largest-remainder split, balanced
- [x] Interbank Transfer: never touches an expense/revenue COA, structurally cannot leak into P&L; pairing never guesses on ambiguity
- [x] Manual Journal: same workflow, validation errors returned (not thrown) for human-entered lines
- [x] Journal header/lines: minimal required fields, debit/credit sign rules, one-of-debit-or-credit, no 0/0 lines
- [x] Balance guard: DB-level check constraint + workflow-function re-check at approve and post, BigInt/sen precision throughout
- [x] Journal numbering: real Postgres sequence, concurrency-safe, never frontend-counted
- [x] Workflow: draft → reviewed → approved → posted, role-enforced by guarded SQL functions + trigger, not just UI
- [x] Bulk workflow: per-id success/failure reporting, never a silent skip
- [x] Idempotency: partial unique index, duplicate generation safely reports `already_exists`
- [x] Reprocess before/after post: regenerate freely pre-post; reverse-then-correct only after post, enforced structurally
- [x] Reversal: opposite lines, `reversal_of_id` link, atomic create-and-post (no GL visibility gap), original marked reversed
- [x] General Ledger + Trial Balance: posted-only source, normal_balance-aware, opening/period split, debit=credit by construction
- [x] Source traceability: journal detail joins back to source transaction, batch, bank account, mapping result
- [x] RLS: investor/management denied on journal_headers/journal_lines/bank_transfers, confirmed live
- [x] Audit trail: every workflow transition + manual journal + bulk action logged
- [x] Real/sanitized-data validation: 8/8 balanced journals, total debit = total credit exactly (Rp 30,473,500.00)
- [x] Regression: Cashflow module untouched; migrations 0010-0015 apply cleanly; its own 15 unit tests still pass
- [x] `typecheck`/`lint`/`test` (160/160)/`build` all PASS
- [x] Database smoke tests: 18/18 new assertions PASS (`test_auto_journal.sql`), 102/102 total across all six SQL suites, zero regressions, verified against a freshly rebuilt Postgres database in a single clean run

**FINAL STATUS: PASS**

Phase 5 Auto Journal & General Ledger PASS. Ready for Phase 6 P&L Engine.
