# Phase 4 Validation Report — Mapping Engine

Builds on Phase 1-3 (all PASS). No existing schema, RLS, role model, Master Data, or Transaction Import code was redesigned — Phase 4 is additive: one migration (`0016_mapping_engine.sql`) adds two `exception_type` enum values, four columns on `bank_transactions_raw`, and one new table (`mapping_runs`). `outlet_mapping_rules`, `coa_mapping_rules`, and `exceptions` already existed since Phase 1's migration `0004` with exactly the shape this phase needed — this phase is what finally reads and writes them. Scope held strictly to mapping + exception handling, per the brief: **no Auto Journal, no journal_headers/journal_lines writes anywhere in this phase** — that is Phase 5.

## Architecture

**One pure engine function, called from every entry point.** `lib/mapping/engine.ts`'s `mapBankTransaction()` takes one row + the active outlet/COA rule sets and returns a full mapping decision (detected outlet, detected COA, which rule matched, ambiguity, interbank/shared-cost flags, and — if applicable — exactly one `exception_type`) with zero I/O. It is called identically by:
- the automatic mapping run right after `commitBankExpenseImport` inserts a batch's rows (`trigger: 'post_import'`),
- the manual **Reprocess Engine** (`reprocessMapping` in `app/mapping/actions.ts`, `trigger: 'manual'`),
- the **Rule Tester** (`testMappingRule`, read-only, no DB write).

This is the same "classify once, run everywhere" principle Phase 3 used for `classifyBankRows` — the Rule Tester can never drift from what the real engine would actually do, because it *is* the real engine.

**Scope decision: bank expense rows only.** Outlet/COA mapping targets `bank_transactions_raw` rows with `credit > 0 AND bank_id IS NOT NULL` (i.e. Phase 3's clean `expense_candidate` rows) exclusively. Revenue rows already carry a resolved `outlet_id` from Phase 3's direct outlet-name matching and a static `clearing_coa_id` per revenue source — there is no ambiguity for a rule engine to resolve there. A row already flagged by Phase 3 (`bank_not_found`, `invalid_amount`, `malformed_data`, `duplicate_suspected`) is never touched by the Mapping Engine — it needs a corrected re-import or a Phase-3-level human decision, not a mapping rule.

## Spec Items 1-3 — Outlet Mapping, COA Mapping, Rule Priority + Specificity

`lib/mapping/rule-match.ts`:
- `matchOutletRule`/`matchCoaRule` — a rule matches when every one of its non-null fields (`bank_id`, `unit_value`, `classification`, `direction`, plus COA-only `outlet_id`/`description_keyword`/`amount_min`/`amount_max`) agrees with the row; `null` on any field means "any" (wildcard). `direction` reads `'out'` as credit>0, `'in'` as debit>0. `match_type`/`match_value` (outlet rules only) supports `exact`/`keyword`/`regex` against the description — an invalid regex never throws, it simply never matches.
- **Resolution order**: lower `priority` number wins outright; a tie on `priority` is broken by **specificity** (count of non-null discriminating fields — a rule pinned to a specific bank+classification beats a bank-only wildcard). A tie on *both* is never silently resolved by array/insertion order — it is reported ambiguous (item 4).
- COA rules additionally filter on `outlet_id` (against the outlet this row just resolved to) and an `amount_min`/`amount_max` range (against the credit amount, via `lib/money.ts`'s `toSen()` — no float comparison).

40 unit tests in `lib/mapping/__tests__/rule-match.test.ts` and `engine.test.ts` cover matching, specificity counting, priority-then-specificity resolution, and every edge case below.

## Spec Item 4 — Ambiguous Mapping Detection

When two or more active rules tie on both `priority` and specificity, `pickBestRule()` returns `ambiguous: true` with every tied rule listed — **no rule is ever guessed**. The engine raises `exception_type: 'ambiguous_mapping'` (new enum value) naming how many rules collided; `detected_outlet_id`/`detected_coa_id` stay `null` rather than picking arbitrarily.

## Spec Item 5 — Exception Center

`/mapping/exceptions` (`app/mapping/exceptions/page.tsx`): lists open (default)/resolved/ignored exceptions on `bank_transactions_raw`, filterable by type, showing the source transaction's raw fields, the engine's suggested outlet/COA, and a per-row resolve form (pick outlet/COA, optional "create rule from this", or Ignore). RLS-scoped identically to `import_batches` (`super_admin`/`accounting`/`finance_manager` only — never `management`, never `investor`).

## Spec Item 6 — Learning Mapping

`lib/mapping/learn.ts`: resolving an exception with "create rule on resolve" checked calls `buildLearnedOutletRule`/`buildLearnedCoaRule`, which scope a new rule to exactly this row's `bank_id`/`unit_value`/`classification` (never the one-off `description`, which would never match anything again) at a low priority number (`10`) so it outranks generic rules without a human having to think about numbering. The next occurrence of the same combination never becomes an exception again. `resolveException`/`bulkResolveExceptions` (`app/mapping/actions.ts`) both wire this in; 8 unit tests in `learn.test.ts` cover the scoping (including `unit_value` blank → `null`, not an empty string that would only ever match blank units again) and the `no_outlet_needed` flag for a row that legitimately resolved no outlet.

## Spec Item 7 — Similar Transaction Suggestion

`lib/mapping/similar.ts`'s `findSimilarRows()`: same `bank_id` + identical `classification_raw` is a high-confidence `exact_classification` match (the real recurring-fee pattern below); same bank with significant description-word overlap but a different classification is a lower-confidence `description_keyword` match, always shown separately. The Exception Center computes this for every exception on the current page and surfaces a count + prompt to bulk-resolve together.

## Spec Item 8 — Bulk Resolution

The Exception Center's checkboxes use the HTML `form="bulk-resolve-form"` attribute to associate with one outer form declared once above the table — no client JS needed. `bulkResolveExceptions` applies one outlet/COA/create-rule decision to every checked exception in a loop, reusing the exact same `resolveOne()` helper the single-row action uses (so bulk and single-row resolution can never diverge in behavior).

## Spec Item 9 — Reprocess Engine

`reprocessMapping` (scope: one batch or a whole entity) re-fetches candidate rows and re-runs `mapBankTransaction()` against the **current** rule set. It only ever touches a row that either has never been mapped (`mapped_at IS NULL`) or whose open exception is one the Mapping Engine itself owns (`MAPPING_OWNED_EXCEPTION_TYPES` — never a Phase 3 import-time exception, and never one a human already resolved/ignored). Every run is logged to the new `mapping_runs` table (scope, trigger, and all nine result counters) — both the automatic post-import run and every manual reprocess. This is the audit trail the Mapping Dashboard reads.

## Spec Items 10-11 — Shared Cost Candidate & Interbank/Interunit Candidate

`lib/mapping/classify-heuristics.ts`: a short, explicit Indonesian keyword list over `classification_raw` + `description_raw` — deliberately conservative rather than a fuzzy classifier, since a false positive here only costs a human a glance at the Exception Center, while a false negative would let an internal transfer get posted as a real expense.

**This was directly validated against the real Buku Bank export from the Phase 3 re-validation**: `"Mutasi antar unit"` is a genuine, recurring classification label in the real August 2026 file (32 occurrences) — confirming the interbank/interunit heuristic targets a real, observed pattern, not a hypothetical one. `interbank_transfer` always wins over `shared_cost_candidate` if a row's text somehow matches both lists (a transfer is never also a shared cost). Both flags are computed *before* outlet/COA resolution and, when they fire, override the exception type even if a rule would otherwise have resolved cleanly — a genuine transfer or shared cost must never silently become a normal posted expense.

## Spec Item 12 — Rule Tester

`components/mapping/rule-tester.tsx` (client component) on `/mapping/rules` calls `testMappingRule` — a thin, read-only server action wrapping the exact same `mapBankTransaction()` used everywhere else, against every currently-active rule. A hypothetical bank/unit/classification/description/debit/credit combination shows exactly what would happen, with zero database writes.

## Spec Item 13 — Mapping Metrics

`/mapping` (Dashboard): total expense-candidate rows, outlet/COA coverage %, "fully mapped, no exception" %, open-exception counts broken down by all 10 exception types (6 Phase-4-owned + 4 Phase-3-owned, since a row can still carry an older Phase-3 exception), and top-10 rule hit counts for both outlet and COA rules (via `matched_outlet_rule_id`/`matched_coa_rule_id`, denormalized onto `bank_transactions_raw` by migration 0016 specifically so this never needs a live join over the full table). A rule with 0 hits is immediately visible in this same list — useful for spotting a rule that's never actually firing (typo'd classification, wrong bank).

## Spec Item 14 — RLS & Audit Trail

- `mapping_runs`: new table, RLS-enabled, `staff_rw_mapping_runs` policy — same `super_admin`/`accounting`/`finance_manager` set as `import_batches`/`outlet_mapping_rules`/`coa_mapping_rules`/`exceptions` (all pre-existing since 0004/0008/0009). No `management`, no `investor` policy anywhere — absence of a policy means denial under RLS, confirmed live (see Gate below).
- Every mutation (`saveOutletRule`, `toggleOutletRuleActive`, `saveCoaRule`, `toggleCoaRuleActive`, `reprocessMapping`, `resolveException`/`bulkResolveExceptions`, `ignoreException`) calls `logAudit()` — the same helper Phases 1-3 use, writing to the existing `audit_log` table.
- Rules are never hard-deleted, only deactivated (`active` flag) — same convention as every Master Data module.

## Spec Item 15 — Real-data / Sanitized Validation

**The real Buku Bank file is not committed to this repository** (per your instruction) — it contains real bank account numbers and real personal names. A fully synthetic replacement, `supabase/tests/fixtures/buku_bank_sanitized_pattern.csv`, reproduces every structural pattern and edge case the real file exposed, using only the 7 banks/5 outlets/COA accounts already seeded in `supabase/seed.sql`:

| Required pattern | How the fixture reproduces it |
|---|---|
| 5-line title/header block | Rows 1-5 are a title block (`BUKU BANK INDUK` / subtitle / blank lines), real header at row 6 — identical structure to the real export, exercising the same `headerRow: 6` blank-row-shift fix from Phase 3 |
| Multiple identical same-day transactions | 3× identical "Setoran kasir harian" Rp 200,000 rows, BCA-Outlet 555, same date |
| Repeated Rp 3,500 rows | 9× "Administrasi Bank" Rp 3,500, Mandiri-Outlet, same date — the exact real-file pattern that exposed Phase 3's fingerprint-collision bug |
| Debit-only rows | 7 "Saldo Awal" + 2 "Setoran Tunai" debit-only rows across multiple banks |
| Unknown bank | `BNI-ISP 003` (a real label from the actual export, not sensitive) — not in seeded Master Data |
| Unknown classification | `Klasifikasi Belum Pernah Dikonfigurasi` — referenced by no rule anywhere |
| Duplicate suspected | Two "Internet & Telepon" rows, same bank/date/credit, different description |
| Repeated import idempotency | Validated by re-running the identical fixture through the full pipeline a second time (see below) |
| Shared cost candidate | `Biaya Bersama Kantor Pusat` classification, BCA AMOR (the corporate/HQ account) |
| Interbank/interunit transfer candidate | `Mutasi antar unit` — the real classification label confirmed in the actual August 2026 file |

**Actual pipeline results** (Phase 3 classify → Phase 4 map, run against the fixture with a representative demonstration rule set — the same shape a real user would configure through `/mapping/rules`):

```
Phase 3 classification (34 total rows after padding-row skip):
  expenseCandidates: 13   debitOnlyIgnored: 9   bankNotFound: 1
  duplicateSuspected: 11  duplicateExact: 0     invalidDate/invalidAmount/malformedRow: 0

Phase 4 mapping (13 expense-candidate rows):
  outletMapped: 7/13      coaMapped: 10/13      fullyMappedNoException: 7/13
  outlet_not_detected: 2  unknown_classification: 2
  shared_cost_candidate: 1  interbank_transfer: 1
```

Verified individually, not just in aggregate:
- The 9 recurring "Administrasi Bank" rows: **1** `expense_candidate` (cleanly outlet+COA mapped, no exception) and **8** `duplicate_suspected` (flagged for review, still inserted) — **zero** `duplicate_exact`, confirming the Phase 3 fingerprint fix and the Phase 4 mapping engine coexist correctly on the exact pattern that caused the original data-loss bug.
- `Mutasi antar unit` → `interbank_transfer` exception **and** still resolves a COA (a transfer-clearing account, via a `no_outlet_needed` rule) with no outlet — exactly the intended "flag for review, don't silently post as a normal expense" behavior.
- `Biaya Bersama Kantor Pusat` → `shared_cost_candidate`, outlet and COA both left `null` (deliberately not rule-configured in this demonstration set) — correctly stopped rather than posted to one arbitrary outlet.
- `Prive` / `Angsuran` → COA resolves cleanly with **no** outlet and **no** exception (`no_outlet_needed` rules) — matches the real file's own recurring non-outlet classifications.
- **Re-import idempotency holds with Phase 4 active**: feeding the first run's inserted dedupe keys back in and re-importing the identical fixture reclassifies **all** rows `duplicate_exact` — 0 rows would be re-inserted.

## Bugs Found & Fixed

No new bugs were found in Phase 4 itself during this validation — the two real bugs this session found (2-digit-year dates, spreadsheet header-row shift, and the critical fingerprint-collision data-loss bug) were Phase 3 issues, already fixed and re-validated in the updated `PHASE3_VALIDATION_REPORT.md` before this phase began. This sanitized fixture's design deliberately re-exercises the fingerprint-collision scenario (the 9 recurring Rp 3,500 rows) specifically to guard against a regression now that Phase 4's mapping engine also touches those same rows — confirmed clean above (1 candidate + 8 suspected, 0 exact).

## Remaining Risks

1. **Rule matching is per-row, not batched.** `runMappingOnRows` issues one `UPDATE` (and, when needed, one `exceptions` read/write) per row rather than a single batched query. Fine for the current scale (a batch's worth of expense candidates); a future push toward very large batches would want to bulk the writes — flagged, not built speculatively, same posture Phase 3 took on its own "future 1M rows" note.
2. **Mapping metrics aggregate in JS**, not via a SQL view — reads every matched-rule row into memory to group and count. Acceptable at demonstrated scale; a production deployment with a very large `bank_transactions_raw` would want a proper aggregate query or materialized view.
3. **The interbank/shared-cost keyword lists are a fixed, hand-maintained set** (not configurable through the UI in this phase). They are deliberately conservative and validated against one confirmed real label (`Mutasi antar unit`); a different bank's export may use different phrasing that would need the list extended. Adding a rule-driven (rather than hardcoded) version of this detection is a reasonable Phase 5+ follow-up if it proves too rigid in practice.
4. **The demonstration rule set used for fixture validation is illustrative, not a real chart of business rules** — real outlet/classification-to-COA mappings for the actual company need to be entered through `/mapping/rules` (or migrated in bulk) before this goes live; this phase proves the *engine* is correct, not that any specific business's rules are pre-loaded.

## Gate

- [x] Outlet Mapping: bank/unit/classification/direction/description-match rules, wildcard (`null`) fields, real-vs-demo validated
- [x] COA Mapping: same shape plus outlet filter, amount range, `no_outlet_needed`
- [x] Rule priority + specificity: lower priority wins; specificity breaks priority ties; never silently resolved beyond that
- [x] Ambiguous mapping detection: tied rules never guessed, `ambiguous_mapping` exception raised with every candidate listed
- [x] Exception Center: list/filter/resolve/ignore, RLS-scoped like every other import table
- [x] Learning Mapping: resolving with "create rule" scopes a new high-priority rule to bank/unit/classification
- [x] Similar Transaction Suggestion: exact-classification and description-keyword tiers, feeding bulk resolution
- [x] Bulk Resolution: one decision applied to many exceptions via the same `resolveOne()` path as single-row resolve
- [x] Reprocess Engine: batch or entity scope, never touches a human-resolved/ignored row, every run logged to `mapping_runs`
- [x] Shared cost candidate: keyword-detected, overrides normal resolution, validated against the real file's own classification vocabulary
- [x] Interbank/interunit candidate: same, confirmed against a real, recurring real-file classification label (`Mutasi antar unit`)
- [x] Rule Tester: identical function as the live engine, read-only
- [x] Mapping Metrics: coverage %, exception counts by type, rule hit counts (including 0-hit rules)
- [x] RLS: `mapping_runs` denies investor/management (live-tested); `outlet_mapping_rules`/`coa_mapping_rules`/`exceptions` denial confirmed (existing + newly added checks)
- [x] Audit trail: every mutation logged via the existing `logAudit()` helper
- [x] Sanitized fixture reproduces every required real-file pattern; real file itself excluded from git
- [x] No Auto Journal / journal writes anywhere in this phase — confirmed by code review of every new file
- [x] `typecheck`/`lint`/`test` (105/105)/`build` all PASS
- [x] Database smoke tests: 16/16 new assertions PASS (`test_mapping_engine.sql`), 84/84 total across all five SQL suites, zero regressions, verified against a freshly rebuilt Postgres database

**FINAL STATUS: PASS**

Phase 4 Mapping Engine PASS. Ready for Phase 5 Auto Journal. Saya akan review terlebih dahulu.
