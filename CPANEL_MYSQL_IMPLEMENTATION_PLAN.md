# cPanel / PHP / MySQL Implementation Plan — Core Migration

**Status: PLANNING ONLY. No rewrite has started.** This is the ordered, phase-by-phase implementation plan requested after `MIGRATION_TO_CPANEL_MYSQL_PLAN.md`. It covers **core migration only** — Authentication/RBAC through Investor Portal/Closing. Cashflow migration (confirmed in scope, confirmed separate) is Phase 6 of this same plan, sequenced *after* the core platform (Phases 1-5) is PASS, and is scoped as "port existing behavior onto the shared platform," never a redesign. **Awaiting your approval before any code is written.**

## Confirmed constraints carried into this plan

1. Cashflow migrates onto the **same** MySQL database, same auth, same RBAC, same Entity/Outlet/Bank Account master tables, same audit infrastructure — no duplicate master tables, ever.
2. Accounting **General Ledger remains the sole source of truth** for financial reporting. Cashflow is a reporting/management layer over shared-platform data, never a competing ledger.
3. Cashflow's existing behavior (validated, regression-tested in the current system) is preserved — ported, not redesigned, in Phase 6.
4. Cashflow migration does not start until Phases 1-5 (core) are PASS.
5. Every phase below states its own exit criteria; a phase is not "done enough to move on" until its exit criteria hold against a real MySQL database, mirroring exactly the discipline every prior Postgres phase used (real infra validation, not static review).

---

## Target Folder Architecture

```
/app
  /Controllers
    AuthController.php
    EntityController.php  OutletController.php  BankAccountController.php  CoaController.php
    InvestorController.php  ContractController.php  OwnershipController.php
    ImportController.php
    MappingController.php  ExceptionController.php
    JournalController.php  LedgerController.php  TrialBalanceController.php
    PeriodController.php
    CashflowController.php  ...  (Phase 6)
    PnlController.php                              (Phase 7)
    AllocationController.php                       (Phase 8)
    DistributionController.php                     (Phase 9)
    InvestorPortalController.php                    (Phase 10)
  /Models
    (thin row-shape classes: Entity, Outlet, JournalHeader, ... — no query
     logic lives here; see "PHP Service Layer" below for why)
  /Services
    AuthService.php  AuditService.php
    MasterDataService.php  OwnershipService.php
    ImportService.php  SpreadsheetParser.php
    MappingEngineService.php  ExceptionService.php
    JournalWorkflowService.php  JournalBuilderService.php  LedgerService.php
    PeriodService.php
    CashflowSyncService.php  ...                    (Phase 6)
    PnlService.php                                  (Phase 7)
    AllocationService.php                           (Phase 8)
    DistributionService.php                         (Phase 9)
    InvestorPortalService.php                        (Phase 10)
    Money.php   (sen-integer arithmetic — ported from lib/money.ts)
  /Repositories
    one per aggregate root, e.g. JournalRepository.php, OwnershipRepository.php,
    ExceptionRepository.php — every method takes the acting user/role
    explicitly; this is the only layer allowed to write raw SQL
  /Middleware
    AuthMiddleware.php  RoleMiddleware.php  CsrfMiddleware.php
  /Policies
    one per module, e.g. JournalPolicy.php, OwnershipPolicy.php — the
    action-level RBAC checks (see RBAC Architecture below)
  /Helpers
    Uuid.php  DateTime.php  Csv.php  Validation.php
/config
  app.php  database.php  session.php   (all read from .env via a tiny
  loader — no framework dependency needed for this part)
/database
  schema/            one numbered .sql file per phase (see migration order)
  seeds/             mirrors supabase/seed.sql, one file per phase
  migrate.php         a small CLI runner: applies schema/*.sql in order,
                      tracks applied migrations in a `schema_migrations`
                      table (name + applied_at) so re-running is a no-op —
                      the PHP-side equivalent of `supabase db reset`
/public
  index.php           single front controller; routes to Controllers
  .htaccess            rewrite-to-index.php, deny-list for /storage, /config
  assets/
/resources
  views/               one subfolder per module, plain PHP templates
                       (no Blade dependency unless Laravel is later adopted)
/storage
  logs/                app + audit-relevant error logs
  uploads/             import files (bank expense/revenue spreadsheets)
  sessions/            DB-backed by default (see Auth/Session Architecture) —
                       this folder exists only as a fallback path
/tests
  Unit/                ports the 160 lib/**/__tests__ cases (PHPUnit or Pest)
  Feature/             ports the 6 SQL suites' scenarios as end-to-end tests
  Fixtures/            the sanitized CSV fixture + any other test data,
                       carried over unchanged from supabase/tests/fixtures/
/cron
  sync_sheets.php      Phase 6: cPanel Cron Job entry point, no HTTP layer
```

**Why `/Models` stays thin and `/Repositories` holds all SQL**: this is the direct replacement for what RLS used to guarantee. A `Model` class here is a plain data-shape (constructor + properties), never an ActiveRecord that can run its own queries — every read/write goes through a `Repository` method that takes the acting user's role/id as an explicit argument, so a controller cannot accidentally fetch an unscoped row. See `MIGRATION_TO_CPANEL_MYSQL_PLAN.md` §7 for the full reasoning; this plan builds on that decision rather than re-arguing it.

---

## MySQL Schema Migration Order

One numbered `.sql` file per phase, matching the phase numbering below exactly (not the original 17-file Postgres numbering, which mixed phases with Cashflow interleaved) — so the schema's own history documents the *new* build order, and a partial migration run always leaves the database in a state that matches a completed phase, never a half-finished cross-phase state:

| File | Phase | Introduces |
|---|---|---|
| `0001_core_foundation.sql` | 1 | `schema_migrations`, `profiles` (+ `password_hash`), `sessions` (if DB-backed), `audit_log` |
| `0002_master_data.sql` | 2 | `entities`, `outlets`, `coa`, `banks`, `investors`, `partnership_contracts`, `investor_ownerships`, `accounting_periods` |
| `0003_import.sql` | 3 | `import_batches`, `import_source_configs`, `revenue_sources`, `bank_transactions_raw`, `revenue_transactions_raw`, `import_row_errors` |
| `0004_mapping_exception.sql` | 4 | `outlet_mapping_rules`, `coa_mapping_rules`, `exceptions`, `mapping_runs` |
| `0005_journal_gl.sql` | 5 | `journal_headers`, `journal_lines`, `bank_transfers`, `document_number_counters`, `v_posted_journal_lines` (view), the 4 generated-column filtered-unique-index columns (see `MIGRATION_TO_CPANEL_MYSQL_PLAN.md` §2 item 6) |
| `0006_cashflow.sql` | 6 | `bank_accounts`, `cashflow_categories`, `sync_config`, `sync_batches`, `cashflow_transactions`, `sync_errors`, `internal_transfers`, `planned_cashflows`, `payment_schedules`, `account_balance_snapshots`, `alert_rules`, `cashflow_alerts`, `v_cashflow_running_balance`, `v_bank_account_balance` (views) |
| `0007_pnl.sql` | 7 | `pnl_reports` |
| `0008_allocation.sql` | 8 | `allocation_rules`, `allocation_rule_outlets` (the table exists conceptually earlier as an FK target from Phase 5's shared-cost queue, but its *resolution* ships here — see Phase 5 vs. Phase 8 note below) |
| `0009_profit_distribution.sql` | 9 | `profit_distributions`, `investor_profit_shares` |
| `0010_investor_portal_closing.sql` | 10 | period-closing-specific columns/constraints only (`accounting_periods.closed_by`, `closed_at`, `reopened_at`, etc. if not already present in Phase 2) — the Investor Portal itself introduces no new tables, it is a read-scoped view over Phases 2/7/9 |

**Important sequencing note on Allocation vs. Journal**: the *table* `allocation_rules`/`allocation_rule_outlets` must exist by Phase 5 (a shared-cost bank transaction needs somewhere to eventually point once allocated), but this plan deliberately **defers the allocation *resolution* Service/Controller/UI to Phase 8**, per your instruction to migrate core first and keep scope small per phase. Phase 5 ships the same "sits at `waiting_allocation`, never auto-posted to one outlet" behavior the original system already has — it just doesn't yet offer a screen to *resolve* that queue. This is exactly the original system's own behavior for an unresolved shared-cost row today, so nothing user-visible regresses; Phase 8 adds the resolution workflow on top of a queue that's already correct and already tested from Phase 5 onward.

---

## PHP Service Layer

Each `Service` class is the direct port of one `lib/*` TypeScript module, keeping the same "one pure function, called from every entry point" discipline:

| Service | Ports from | Responsibility |
|---|---|---|
| `Money` | `lib/money.ts` | sen-integer arithmetic, `allocateProportionally()`/`allocateEqually()` (largest-remainder) |
| `AuthService` | `lib/supabase/{client,server}.ts` + Supabase Auth | login, logout, password hashing/verification, session issuance |
| `AuditService` | `lib/supabase/audit.ts` | one `logAudit()`-equivalent call, used by every mutating Service method |
| `MasterDataService` | `app/master-data/*/actions.ts` | Entity/Outlet/Bank/COA/Investor/Contract CRUD business rules (bank requires distinct COA, contract validity windows, etc.) |
| `OwnershipService` | `app/master-data/ownerships/actions.ts` + `fn_ownership_as_of`/`fn_check_ownership_total` | effective-dated ownership resolution, total-ownership-≤100%-for-overlapping-dates guard |
| `ImportService` + `SpreadsheetParser` | `lib/import/*` | column mapping, row classification, dedupe-key/fingerprint, date/money normalization |
| `MappingEngineService` | `lib/mapping/engine.ts` + `rule-match.ts` | outlet/COA rule resolution, priority+specificity, ambiguous detection, interbank/shared-cost heuristics |
| `ExceptionService` | `app/mapping/actions.ts` (resolve/learn/similar) | exception resolution, learning a rule, similar-transaction suggestion |
| `JournalBuilderService` | `lib/journal/build-*.ts` | the 5 pure journal builders + `checkBalance()` |
| `JournalWorkflowService` | `fn_review_journal`/`fn_approve_journal`/`fn_post_journal`/`fn_reverse_journal` | role-gated state transitions, balance re-check, idempotent generation, atomic reversal |
| `PeriodService` | `fn_guard_period_lock`/`fn_reopen_period`/`fn_period_readiness` | open/closed/published period enforcement, authorized reopen |
| `LedgerService` | `v_posted_journal_lines` + GL/Trial Balance pages | posted-only aggregation, normal_balance-aware presentation |
| `CashflowSyncService` (Phase 6) | `lib/cashflow/*` | Google Sheet sync, internal transfer suggestion, balance snapshot rebuild |
| `PnlService` (Phase 7) | new (Phase 6 in the original roadmap, never built) | P&L computation from posted journal lines only, immutable publish snapshot |
| `AllocationService` (Phase 8) | `fn_check_allocation_reconciles` + allocation UI | shared-cost resolution: assign outlet weights, generate the balanced journal, exact reconciliation |
| `DistributionService` (Phase 9) | `fn_lock_distribution_snapshot`/`fn_lock_share_snapshot` | profit split per ownership%, snapshot immutability once approved |
| `InvestorPortalService` (Phase 10) | RLS investor policies | the row-scoped `user → investor → ownership → outlet → effective period` resolution, read-only |

Every Service method that writes data wraps its work in one `PDO` transaction (see Database Transaction Strategy) and ends with an `AuditService` call — mirroring exactly how every guarded Postgres function ended with an `insert into audit_log`.

---

## Auth / Session Architecture

- **Credentials**: `profiles.password_hash` (new column — Supabase Auth held this before), written with `password_hash($plain, PASSWORD_BCRYPT)`, verified with `password_verify()`. Never logged, never round-tripped through the audit trail's `old_value`/`new_value` JSON (an explicit redaction rule in `AuditService`).
- **Session storage: DB-backed by default**, not PHP's default file-based session handler. A `sessions` table (`id`, `user_id`, `payload`, `last_activity`) with a custom `SessionHandlerInterface` implementation. Reasoning: shared-hosting `session.save_path` (usually a shared `/tmp`) can be cleaned by the host without notice, has file-count quotas on some plans, and offers no visibility into "who is currently logged in" for an admin. A DB table costs one extra query per request and buys predictability and auditability — worth it for a finance system. File-based sessions remain the documented fallback if a specific host's MySQL connection limits make this impractical.
- **Cookie flags**: `httponly`, `secure` (once HTTPS is confirmed — cPanel + Let's Encrypt via AutoSSL is standard and assumed), `samesite=Lax`.
- **Fixation protection**: `session_regenerate_id(true)` immediately on successful login and immediately on privilege-relevant events (role change).
- **CSRF**: one token per session, regenerated per session (not per-request, to survive multi-tab use), verified by `CsrfMiddleware` before any Controller with a POST/PUT/DELETE route runs.
- **Password reset**: token-based (`password_reset_tokens` table: `user_id`, `token_hash`, `expires_at`, single-use), emailed via cPanel's local `sendmail`/SMTP (no third-party email API dependency required, though one can be layered in later).
- **Rate limiting on login**: a simple `login_attempts` counter (by IP + by account) in the same DB, since there's no persistent process available for an in-memory rate limiter.

---

## RBAC Architecture

Same five roles as today: `super_admin`, `accounting`, `finance_manager`, `management`, `investor`. Two layers, matching the two things RLS used to do at once:

1. **Action-level (`/app/Policies/*.php`)** — "can this role do X at all," a direct port of `lib/supabase/permissions.ts`'s `WRITE_ROLES` map, graduated from "UX-only" to "the actual enforcement," called explicitly at the top of every Controller action:
   ```php
   Policy::authorize($currentUser, 'journal.approve'); // throws 403 if not finance_manager/super_admin
   ```
2. **Row-level (`/app/Repositories/*.php`)** — "which rows can this specific user see/touch," resolved *inside every query*, never as a post-fetch filter. For investor-scoped data this is always the same subquery shape: `outlet_id IN (SELECT outlet_id FROM investor_ownerships WHERE investor_id = :investorId AND :asOfDate BETWEEN start_date AND COALESCE(end_date, :asOfDate))`. A Repository method for investor-facing data takes `$investorId` as a required argument with no "trust me, I already checked" path — this is the direct, load-bearing replacement for RLS's per-row guarantee and the highest-risk piece of the whole migration (flagged in the prior plan's risk table too).
3. **Verification**: every one of `test_rls.sql`'s 23 assertions (and `test_auto_journal.sql`'s 4 investor/management-denial assertions) becomes a `Feature` test that logs in as a given role and asserts the exact same denial — including the specific attack named in your original requirement: an investor changing a URL/POST id to try to reach another outlet's data must still get denied by the Repository's own query shape, not by a Controller-level `if` that a future edit might remove.

---

## Database Transaction Strategy

- **Every write that must be atomic** (journal header + lines, reversal-flip-then-insert-then-post, ownership insert + total-check, distribution + shares) runs inside one explicit `PDO::beginTransaction()` / `commit()` / `rollBack()` block in the Service layer — never left to autocommit. This is the direct replacement for Postgres wrapping a trigger-guarded statement in an implicit transaction.
- **Isolation level**: MySQL/MariaDB InnoDB default `REPEATABLE READ` is kept (not lowered) — it already prevents the dirty-read class of bug, and the concurrency this system needs (one accountant at a time, realistically, per your own "accounting is only 1 person" note from Phase 5) does not need a stricter level.
- **The idempotent-numbering pattern** (journal numbers, any future document numbers): `SELECT next_value FROM document_number_counters WHERE scope = ? AND year = ? AND month = ? FOR UPDATE`, increment, use, all inside the same transaction as the row insert — guarantees no two concurrent requests ever get the same number, portable across MySQL and MariaDB without needing `CREATE SEQUENCE`.
- **The idempotent-generation pattern** (duplicate journal-for-same-source prevention): rely on the generated-column unique index from `MIGRATION_TO_CPANEL_MYSQL_PLAN.md` §2 item 6; catch the resulting duplicate-key `PDOException` (MySQL error code `1062`) specifically and treat it as an "already exists, skip" outcome — the direct PHP equivalent of the existing `insertJournalDraft()`'s Postgres `23505` handling.
- **Deadlock handling**: InnoDB can raise error `1213` (deadlock) under concurrent writes to the same rows; every transactional Service method retries once automatically on `1213` before surfacing an error (cheap insurance, not expected to fire often at this system's realistic concurrency).
- **No cross-request transactions**: a transaction never spans more than one HTTP request/PHP process lifetime — this rules out any temptation to hold a lock open across a user-facing multi-step wizard; multi-step flows (e.g. import preview → commit) persist intermediate state as rows (`import_batches` in a `pending` state), not as an open transaction.

---

# Phase 1 — Core Foundation

**Modules**: Authentication, Session Management, RBAC/Authorization framework, Audit Trail infrastructure, base routing/Middleware pipeline, `.env`/config loading, `migrate.php` schema runner.

**Tables**: `schema_migrations`, `profiles` (id, name, email, role, `password_hash`, active flag, timestamps), `sessions` (if DB-backed), `password_reset_tokens`, `login_attempts`, `audit_log` (id, user_id, action, entity_table, entity_id, old_value JSON, new_value JSON, created_at).

**Services**: `AuthService`, `AuditService`, the `Policy` base class + `RoleMiddleware`/`CsrfMiddleware`/`AuthMiddleware`.

**Routes/Pages**: `/login`, `/logout`, `/forgot-password`, `/reset-password/{token}`, a minimal authenticated `/` landing page (role-aware redirect — the same per-role dashboard split the current `app/{accounting,management,investor,admin}/page.tsx` folders imply).

**Tests**: login success/failure, session fixation protection (`session_regenerate_id` fires), CSRF rejection on a forged POST, password hash never appears in any response body or log, role middleware rejects an unauthenticated request to every route registered so far, rate-limit locks out after N failed attempts.

**Migration risks**: this phase has the least reference material to port from (Supabase Auth had no PHP equivalent) — the risk is under-building session/CSRF hardening that Supabase's managed Auth provided for free. Mitigation: treat OWASP's session-management and CSRF cheat sheets as the acceptance bar, not just "it logs in."

**Exit criteria**:
- [ ] `migrate.php` applies `0001_core_foundation.sql` cleanly against a fresh MySQL database, is safely re-runnable (no-op on second run).
- [ ] Login/logout/password-reset flows work end-to-end against real MySQL.
- [ ] Every route registered so far rejects an unauthenticated request and rejects a CSRF-missing POST.
- [ ] `AuditService` write confirmed for every auth-relevant event (login, failed login, password reset).
- [ ] All Phase 1 tests green.

---

# Phase 2 — Master Data

**Modules**: Entity, Outlet, Bank Account (master, not Cashflow's operational bank account — see Phase 6 boundary note below), COA, Investor, Partnership Contract, Ownership.

**Tables**: `entities`, `outlets`, `coa`, `banks`, `investors`, `partnership_contracts`, `investor_ownerships`, `accounting_periods` (created here since ownership/contract validity and every later phase's period-scoping depend on it existing early, even though full Closing workflow ships in Phase 10).

**Services**: `MasterDataService` (Entity/Outlet/Bank/COA/Investor/Contract CRUD + validation: bank requires a distinct `coa_id`, contract date-range sanity), `OwnershipService` (`ownershipAsOf($outletId, $date)`, `assertTotalOwnershipNotExceeded()` — the direct port of `fn_ownership_as_of`/`fn_check_ownership_total`, now a PHP check run inside the same transaction as the insert, not a DB trigger).

**Routes/Pages**: `/master-data/{entities,outlets,coa,banks,investors,contracts,ownerships}` list+detail+CRUD, mirroring the existing Next.js page set 1:1.

**Tests**: every `test_master_data.sql` assertion ported (duplicate outlet code rejected, bank-without-COA rejected, distinct-COA-per-bank check, ownership over-100% rejected, historical ownership preserved on supersede, deactivation preserves historical relations, role-gated create per table, management-cannot-write-banks denial).

**Migration risks**: the ownership total-percentage guard is the one piece of real business logic in this phase (everything else is CRUD) — it must run inside the *same* transaction as the ownership insert it's guarding, or a race between two concurrent ownership inserts could both pass the check and jointly exceed 100%. Mitigate with `SELECT ... FOR UPDATE` on the outlet's existing ownership rows before computing the total, inside the transaction.

**Exit criteria**:
- [ ] `0002_master_data.sql` applies cleanly on top of Phase 1.
- [ ] Every `test_master_data.sql`-equivalent assertion passes against real MySQL.
- [ ] Concurrent-ownership-insert race condition explicitly tested (two near-simultaneous requests, only one should succeed if together they'd exceed 100%).
- [ ] RBAC: `management` confirmed denied on `banks`/`partnership_contracts`/`investor_ownerships` writes; `investor` confirmed denied on all master-data writes.

---

# Phase 3 — Import

**Modules**: Bank Expense Import, Revenue Import, Import Source Config (incl. Google Sheet URL config — the *config* only; the actual sync job is Phase 6), Import History.

**Tables**: `import_batches`, `import_source_configs`, `revenue_sources`, `bank_transactions_raw`, `revenue_transactions_raw`, `import_row_errors`.

**Services**: `SpreadsheetParser` (CSV always; `PhpSpreadsheet` via Composer only if Excel input is confirmed still needed — see open question below), `ImportService` (column mapping, row classification — `expense_candidate`/`debit_only_ignored`/`bank_not_found`/`invalid_date`/`invalid_amount`/`malformed_row`/`duplicate_exact`/`duplicate_suspected` — dedupe-key/fingerprint generation, batch commit).

**Routes/Pages**: `/import/bank-expense` (+ `[batchId]` detail), `/import/revenue` (+ detail), `/import/history` (+ detail), `/import/sources`.

**Tests**: every `test_transaction_import.sql` assertion (duplicate-exact prevented, repeated-import idempotent, candidate-expense-only-credit>0 filter, debit-only stored-but-ignored, invalid date/money handled, unknown-bank flagged, source traceability, batch summary accuracy, investor/management denial on every import table) + the Phase 3 unit-test business rules (2-digit-year date parsing, header-row shift, the fingerprint-collision fix) ported with the exact same input fixtures.

**Migration risks**: the dedupe-key/fingerprint logic is the most edge-case-heavy pure logic in the whole system (the original Phase 3 found and fixed a real data-loss bug here — recurring same-day/same-amount rows colliding on a naive fingerprint). Port the unit tests *before* the implementation, using the identical fixture rows that caught the original bug, as the acceptance bar — do not consider this phase done from a fresh implementation alone.

**Exit criteria**:
- [ ] `0003_import.sql` applies cleanly on top of Phase 2.
- [ ] The sanitized fixture (`buku_bank_sanitized_pattern.csv`, ported unchanged) runs through the full pipeline with the exact same classification counts as the current system's `PHASE3_VALIDATION_REPORT.md`/`PHASE4_VALIDATION_REPORT.md` document.
- [ ] Re-importing the identical fixture a second time reclassifies 100% of rows as duplicate — zero re-inserts.
- [ ] All `test_transaction_import.sql`-equivalent assertions pass.

**Open question for you before this phase starts**: is Excel (`.xlsx`) input still required in production, or is the real workflow CSV-only (e.g. exported from Google Sheets/the bank's own portal)? This decides whether `PhpSpreadsheet` (a Composer dependency) is needed at all — if CSV-only is acceptable, Phase 3 can be built with zero third-party dependencies, which is a meaningfully simpler/safer deploy.

---

# Phase 4 — Mapping / Exception

**Modules**: Outlet Mapping Rules, COA Mapping Rules, Exception Center (list/resolve/ignore/bulk-resolve), Learning (create-rule-on-resolve), Similar Transaction Suggestion, Reprocess Engine, Mapping Dashboard.

**Tables**: `outlet_mapping_rules`, `coa_mapping_rules`, `exceptions`, `mapping_runs`.

**Services**: `MappingEngineService` (`mapBankTransaction()` — rule matching, priority+specificity resolution, ambiguous-match detection, interbank/shared-cost keyword heuristics), `ExceptionService` (resolve/bulk-resolve/ignore, `buildLearnedOutletRule`/`buildLearnedCoaRule`, `findSimilarRows`).

**Routes/Pages**: `/mapping` (dashboard), `/mapping/rules` (+ Rule Tester), `/mapping/exceptions`.

**Tests**: every `test_mapping_engine.sql` assertion (new exception types accepted, `exceptions` unique-per-row, matched-rule FK integrity, `mapping_runs.scope` check, investor/management denial) + all 40 `lib/mapping/__tests__` unit-test cases (rule matching, specificity counting, priority-then-specificity, ambiguous detection, learning scoping, similar-transaction tiers) ported with identical fixtures, and the sanitized-fixture end-to-end statistics reproduced exactly (7/13 outlet-mapped, 10/13 COA-mapped, 7/13 fully-mapped-no-exception, 1 shared-cost, 1 interbank, per the current `PHASE4_VALIDATION_REPORT.md`).

**Migration risks**: `MappingEngineService::mapBankTransaction()` must remain a pure function (no DB reads inside it) so the Rule Tester and the real engine can never drift — this discipline is the entire reason the original TypeScript version never had a "tester shows X but real engine does Y" bug, and it must be preserved deliberately, not lost to a PHP idiom that makes it convenient to sneak a query in.

**Exit criteria**:
- [ ] `0004_mapping_exception.sql` applies cleanly on top of Phase 3.
- [ ] Rule Tester and the real commit-time engine share the exact same `MappingEngineService` method — verified by a test that asserts they cannot diverge (same input, same output, by construction).
- [ ] Sanitized-fixture mapping statistics match the current system's documented numbers exactly.
- [ ] All `test_mapping_engine.sql`-equivalent assertions pass.

---

# Phase 5 — Journal / GL

**Modules**: Auto Journal generation (bank expense, revenue, interbank transfer, manual — **shared cost queues to `waiting_allocation` but is not yet resolvable**, per the Allocation-deferred-to-Phase-8 note above), Journal Workflow (Draft→Reviewed→Approved→Posted, bulk actions), Idempotent generation, Reversal, General Ledger, Trial Balance, basic period-lock enforcement on posting (full Closing workflow is Phase 10).

**Tables**: `journal_headers`, `journal_lines`, `bank_transfers`, `document_number_counters`; `accounting_periods` gains its posting-guard usage here (table itself from Phase 2).

**Services**: `JournalBuilderService` (5 builders — shared-cost builder exists in code from this phase since it's a pure function with no UI dependency, it simply has no Controller/route calling it yet until Phase 8), `JournalWorkflowService` (review/approve/post/reverse, role gates, balance re-check, idempotency via the generated-column unique index), `LedgerService` (GL + Trial Balance aggregation from `v_posted_journal_lines`), `PeriodService` (posting-time guard only in this phase).

**Routes/Pages**: `/journal` (list, bulk actions), `/journal/{id}` (detail + traceability), `/journal/manual`, `/journal/transfers` (interbank pairing), `/journal/ledger`, `/journal/trial-balance`. **Not yet in this phase**: `/journal/shared-cost` (Phase 8).

**Tests**: every `test_auto_journal.sql` + relevant `test_integrity.sql` assertion (balanced-journal promotes, unbalanced rejected at approve, posted-immutable + unposting-loophole blocked, closed-period rejects posting, duplicate-generation rejected, review/approve/post/reverse role gates, reversal links + exact-opposite lines, corrected-journal-after-reversal succeeds, manual-journal-null-source never collides, 0/0 line rejected, investor/management denial on `journal_headers`/`bank_transfers`) + all 39 `lib/journal/__tests__` builder unit tests ported with identical fixtures, and the sanitized real-data validation reproduced (8 balanced journals, total debit = total credit exactly, per `PHASE5_VALIDATION_REPORT.md`).

**Migration risks**: this is the highest-stakes phase in the entire core migration — it is where the Postgres implementation's own two real bugs lived (the `p_actor`/role-derivation flaw, and the reversal-vs-partial-unique-index ordering bug, both documented in `PHASE5_VALIDATION_REPORT.md`). Port the exact SQL test scenarios that caught those two bugs *first*, before writing the corresponding Service code, so the equivalent PHP bug (if introduced) is caught immediately rather than discovered later. The generated-column filtered-unique-index translation (§2 item 6 of the prior plan) is exercised directly by the duplicate-generation and post-reversal-regenerate tests — treat those two tests as the acceptance gate for that specific schema translation, not just "the index exists."

**Exit criteria**:
- [ ] `0005_journal_gl.sql` applies cleanly on top of Phase 4, including the generated-column unique-index translation.
- [ ] All `test_auto_journal.sql`-equivalent assertions pass, **explicitly including** the reversal-then-correction scenario (the exact bug class found twice in the original implementation).
- [ ] Sanitized real-data run reproduces the same 8-journal, exactly-balanced result as `PHASE5_VALIDATION_REPORT.md`.
- [ ] GL and Trial Balance both read exclusively from posted rows; a draft/reviewed/approved journal is confirmed invisible to both.
- [ ] **Core platform gate**: at this point, Phases 1-5 together constitute "core PHP/MySQL validated and PASS" — the condition you set for starting Phase 6.

---

# Phase 6 — Cashflow Migration

**Modules**: Bank Account (Cashflow's operational view — reconciled against, but not duplicating, Phase 2's `banks` master), Cashflow Categories, Google Sheet Sync (config + cron job), Cashflow Transactions, Internal Transfer suggestion, Planned Cashflow / Payment Schedules, Balance Snapshots, Alert Rules / Alerts, Cashflow Dashboard/Reports/Calendar.

**Tables**: `bank_accounts`, `cashflow_categories`, `sync_config`, `sync_batches`, `cashflow_transactions`, `sync_errors`, `internal_transfers`, `planned_cashflows`, `payment_schedules`, `account_balance_snapshots`, `alert_rules`, `cashflow_alerts`.

**Explicit shared-platform boundary (per your constraint)**:
- `bank_accounts` (Cashflow) is a *distinct table* from `banks` (Phase 2, the accounting master) in the **current** system already — this was a deliberate Phase-1-era design choice, not an accident, because Cashflow's bank account tracks day-to-day balance/sync state that accounting's `banks` master never needed. **This plan keeps that separation** rather than merging them, because merging would risk exactly what you said not to do ("jangan membuat Cashflow menjadi source of truth untuk accounting") in the *other* direction — but it links `bank_accounts` to `banks`/`entities`/`outlets` by foreign key rather than duplicating entity/outlet/account-name data, which is the actual "no duplicate master tables" requirement. **Open question for you**: confirm this FK-linked-but-distinct-table approach matches your intent, versus a tighter option (Cashflow's `bank_accounts` becomes a thin view over `banks` with only the Cashflow-specific columns in a side table) — both satisfy "no duplicated master data," they differ in how much Cashflow-specific schema stays separate.
- Cashflow never writes to `journal_headers`/`journal_lines` and never computes a P&L-relevant figure from `cashflow_transactions` — General Ledger (Phase 5) remains the sole source for financial reporting, Cashflow is a liquidity/planning view, exactly as instructed.
- Cashflow reuses Phase 1's `AuthService`/session, Phase 1's RBAC `Policy`/`Middleware` classes, Phase 2's `entities`/`outlets`/`banks`, and Phase 1's `AuditService` — zero new auth/RBAC/audit code in this phase.

**Services**: `CashflowSyncService` (ported from `lib/cashflow/syncService.ts` + `googleSheets.ts` — Google Sheet public-CSV-export fetch instead of the `googleapis` OAuth client, per the prior plan's §2 item 11/§4 item 5), plus the existing Cashflow business logic (balance snapshot rebuild, internal-transfer-suggestion-never-auto-confirm rule, alert rule evaluation) ported behind the same Repository-scoped-by-role discipline as every other module.

**Routes/Pages**: `/cashflow`, `/cashflow/accounts` (+ detail), `/cashflow/dashboard`, `/cashflow/calendar`, `/cashflow/payment`, `/cashflow/plan`, `/cashflow/reports`, `/cashflow/settings/{accounts,alerts,categories,sync}`, `/cashflow/transactions`. `/cron/sync_sheets.php` as the cPanel Cron Job entry point (replacing `/api/cashflow/cron-sync`).

**Tests**: all 15 current `lib/cashflow/__tests__` cases ported with identical fixtures (including `syncService.integration.test.ts`'s "internal transfer pair is only ever SUGGESTED, never auto-confirmed" — a behavior your instruction explicitly says to preserve), plus a new **reconciliation test** comparing this phase's Cashflow numbers against Phase 5's GL numbers for the same period, to positively confirm Cashflow is not silently drifting into a second source of truth.

**Migration risks**: the Google Sheets OAuth-to-public-CSV swap is a genuine behavior change at the integration boundary (different failure modes — a sheet whose sharing setting changes fails differently under public-CSV than under OAuth) even though the *business logic downstream of the fetch* is unchanged; test the failure path (sheet unshared/URL wrong) explicitly, not just the happy path. The "no duplicate master tables" constraint is the other real risk — it is easy to accidentally let a Cashflow Controller read/write `banks`-equivalent fields directly on `bank_accounts` in a way that silently forks from Phase 2's `banks` row; the FK-linked design above is the guard, and the reconciliation test above is how a fork would be caught.

**Exit criteria**:
- [ ] `0006_cashflow.sql` applies cleanly on top of Phase 5, with `bank_accounts` FK'd to `banks`/`entities`/`outlets`, no duplicated column data.
- [ ] All 15 Cashflow unit tests pass with ported fixtures, identical results to the current TypeScript suite.
- [ ] Cron sync runs successfully as a cPanel Cron Job invocation (not an HTTP call) against a real Google Sheet.
- [ ] Reconciliation test confirms Cashflow figures never override or contradict GL for the same period/account.
- [ ] Internal-transfer-pair suggestion confirmed still never auto-confirms.

---

# Phase 7 — P&L

**Modules**: P&L computation, Review/Approve/Publish workflow, immutable published snapshot. (This is "Phase 6 P&L Engine" from the original Postgres-track roadmap — renumbered here to 7 because Cashflow now sits between core-Journal/GL and P&L in the PHP build order, per your instruction; the P&L *design itself* was never built against Postgres, so there is no prior implementation to port here — this phase is new work, informed only by the schema `pnl_reports` already reserved for it since the original Phase 1 and by the existing `fn_guard_pnl_publish`/`fn_publish_pnl` guard pattern.)

**Tables**: `pnl_reports`.

**Services**: `PnlService` — computes revenue/COGS/operating-expense from `v_posted_journal_lines` **only** (never from raw bank/revenue transactions, per your explicit instruction), by period + outlet; workflow mirrors Journal's own Draft→Reviewed→Approved→Published, with **Published being a one-way, immutable snapshot** (the direct port of `fn_guard_pnl_publish`'s trigger-enforced rule, now a `PnlWorkflowService` check run inside the same transaction as the status flip, with no raw-`UPDATE` path that bypasses it — same "guarded function" discipline, PHP-side).

**Routes/Pages**: `/pnl` (list by period/outlet), `/pnl/{id}` (detail — revenue/COGS/opex breakdown with drill-down to the contributing posted journal lines), review/approve/publish actions.

**Tests**: P&L figures computed **only** from posted journal lines — a test that inserts a draft/reviewed/approved (not-yet-posted) journal and confirms it does not affect any P&L figure; publish-then-attempt-edit rejected (immutability); publish requires every contributing period to be non-open-for-the-relevant-outlet (i.e., period readiness — port of `fn_period_readiness`); role gates (who may publish) matching the same role tier as journal posting.

**Migration risks**: since this is new design work (no prior Postgres implementation exists to diff against), the risk is under-specifying an edge case the original roadmap never had to resolve (e.g., a period that closes *between* P&L draft-generation and publish — must re-check readiness at publish time, not just at draft time, the same "re-check at every promotion step" discipline Phase 5's journal workflow already established). Mitigate by writing this phase's test list *before* the Service code, explicitly walking every Journal-workflow lesson (re-check balance/state at every promotion, never trust a value computed earlier in the flow) into the equivalent P&L check.

**Exit criteria**:
- [ ] `0007_pnl.sql` applies cleanly on top of Phase 6.
- [ ] P&L figures verified to come exclusively from posted journal lines (explicit negative test: an approved-but-not-posted journal must not appear).
- [ ] Publish is confirmed a one-way, immutable transition — no code path can edit a published `pnl_reports` row.
- [ ] Role gates match Journal's posting tier exactly (or your specified tier, if P&L publish should differ — confirm before building).

---

# Phase 8 — Allocation

**Modules**: Shared Cost Allocation resolution (the piece deliberately deferred from Phase 5) — assign outlet weights to a `waiting_allocation` bank transaction, generate the balanced multi-outlet journal, exact reconciliation guard.

**Tables**: `allocation_rules`, `allocation_rule_outlets` (both already exist in schema from Phase 5's shared-cost queue; this phase adds the resolution Service/Controller/UI on top).

**Services**: `AllocationService` — `resolveSharedCost($bankTransactionId, $outletWeights)`: splits the total via `Money::allocateProportionally()`/`allocateEqually()` (largest-remainder — zero floating point, sum of shares always exactly equals the total), calls `JournalBuilderService`'s shared-cost builder (already ported in Phase 5), inserts the resulting balanced journal through the same `JournalWorkflowService` idempotency/workflow path every other journal uses, and enforces `assertAllocationReconciles()` — the direct port of `fn_check_allocation_reconciles` (over-allocation rejected, exact match required).

**Routes/Pages**: `/journal/shared-cost` (the one route explicitly deferred out of Phase 5) — lists `waiting_allocation` rows, resolution form (outlet checkboxes + per-outlet weight, using the same `weight_<outletId>`-keyed-field pattern the original TypeScript form used after its own field-misalignment bug fix — ported deliberately, not reinvented).

**Tests**: over-allocation rejected, exact-reconciliation-required, zero-weight-outlet filtered out (never produces an invalid 0/0 line), fewer-than-2-non-zero-outlets rejected, the Rp100/3-way largest-remainder case, one-allocation-per-bank-transaction uniqueness (port of `uq_allocation_bank_transaction`), and an end-to-end test that a Phase-5-queued `waiting_allocation` row (created before this phase existed) resolves correctly once this phase ships — proving the deferred-scope design from Phase 5 was genuinely forward-compatible, not just assumed to be.

**Migration risks**: low relative to Phases 5/6 — this is the smallest phase, reusing an already-tested journal builder and an already-tested workflow path; the main risk is the weight/outlet field-alignment bug class that bit the original TypeScript form (documented in `PHASE5_VALIDATION_REPORT.md` Bug #5) — mitigated by deliberately porting the already-fixed keyed-field pattern rather than re-deriving the form from scratch.

**Exit criteria**:
- [ ] `0008_allocation.sql` (if any incremental schema is needed beyond what Phase 5 already created) applies cleanly.
- [ ] Every allocation-precision test (including Rp100/3) passes.
- [ ] A `waiting_allocation` row queued during Phase 5's own testing resolves correctly through this phase's new UI, without needing any Phase 5 code change.

---

# Phase 9 — Profit Distribution

**Modules**: Distribution calculation (net profit × ownership% per contract), immutable snapshot on approval, investor share computation.

**Tables**: `profit_distributions`, `investor_profit_shares`.

**Services**: `DistributionService` — computes `distributable_profit` from a published `pnl_reports` row (Phase 7) and the outlet's ownership resolved as-of the distribution date (Phase 2's `OwnershipService::ownershipAsOf()`), splits it per investor via `Money::allocateProportionally()` (the same Rp100/3-way exact-split guarantee, reused a third time across this codebase — journal shared-cost, this phase, and originally profit distribution in Postgres too), and enforces snapshot immutability once `status = 'approved'` (port of `fn_lock_distribution_snapshot`/`fn_lock_share_snapshot`).

**Routes/Pages**: `/distribution` (list by period/outlet), `/distribution/{id}` (detail: net profit snapshot, ownership% snapshot, per-investor share breakdown), review/approve actions.

**Tests**: `sum(investor_profit_shares.share_amount) === distributable_profit` exactly (the direct port of `test_integrity.sql`'s test 12, same Rp100/3 case), snapshot immutable after approval (`net_profit_snapshot`/`distribution_pct_snapshot` cannot change), distribution requires the source P&L to be `published` (not draft/reviewed/approved), ownership resolved as-of the correct date (not today's ownership if the distribution is for a past period).

**Migration risks**: the dependency chain here (P&L must be published → ownership must resolve correctly as-of that period, not "as-of now" → shares must sum exactly) is the deepest cross-module dependency chain in the whole system; a bug in any upstream phase (P&L publish gating, or `OwnershipService::ownershipAsOf()`'s date-boundary handling) surfaces here as a wrong distribution, which is the single most sensitive number in the entire application from the investors' point of view. Mitigate with an explicit integration test that chains all three (create a published P&L for a past period → confirm the ownership resolved for the distribution is the *period's* ownership, not current ownership → confirm shares sum exactly).

**Exit criteria**:
- [ ] `0009_profit_distribution.sql` applies cleanly on top of Phase 8.
- [ ] Cross-module chain test (P&L publish → correct-period ownership → exact share sum) passes.
- [ ] Snapshot immutability confirmed the same way Phase 5's posted-journal immutability was confirmed (direct edit attempt rejected).

---

# Phase 10 — Investor Portal / Closing

**Modules**: Investor Portal (read-only, row-scoped views over Ownership/P&L/Distribution), full Accounting Period Closing workflow (close/reopen with role authorization, readiness check spanning Journal/P&L/Distribution).

**Tables**: no new tables beyond period-closing metadata columns on `accounting_periods` if not already present from Phase 2 (`closed_by`, `closed_at`, `reopened_by`, `reopened_at`, `reopen_reason`).

**Services**: `InvestorPortalService` — every method resolves `user → investor → ownership → outlet → effective period` *inside the query*, per the RBAC Architecture section above; this phase has zero new business logic beyond that resolution (it reads Phase 2/7/9 data, computes nothing new). `PeriodService` gains its full closing surface here: `closePeriod()` (requires every journal for that period+outlet to be posted or reversed, per `fn_period_readiness`), `reopenPeriod()` (role-gated to `finance_manager`/`super_admin`, requires a reason, logged to audit).

**Routes/Pages**: `/investor` (portal dashboard — own ownership, own outlet's published P&L, own distributions, own bank-account-balance visibility if Cashflow exposes any investor-visible view), `/accounting-periods` (staff-facing close/reopen action + readiness indicator).

**Tests**: **the single most important test class in this entire migration** — direct URL/ID tampering by an authenticated investor: log in as investor A, request investor B's distribution/ownership/outlet P&L by guessing or incrementing an id in the URL/POST body, assert denial every time (this is the literal scenario named in your original requirement — "Investor tidak boleh bisa akses data outlet lain dengan mengubah URL/ID request"). Also: closed period rejects new journal posting (already covered structurally since Phase 5, re-confirmed here now that the *authorized reopen* path also exists and must not accidentally weaken the guard); reopen requires the correct role + a logged reason; a period's readiness check correctly reflects an unposted/unreconciled journal blocking closure.

**Migration risks**: this phase is where every RBAC row-scoping decision made since Phase 1 gets its final, most consequential exam — a subtle mistake here is a real investor-facing data leak, not a cosmetic bug. Treat this phase's URL/ID-tampering test suite as non-negotiable and exhaustive (every investor-visible route, not a sample), matching the rigor `test_rls.sql` already established for the same guarantee under Postgres RLS.

**Exit criteria**:
- [ ] `0010_investor_portal_closing.sql` applies cleanly on top of Phase 9.
- [ ] Every investor-visible route has an explicit, passing URL/ID-tampering denial test — no exceptions, no route considered "obviously fine."
- [ ] Period close/reopen workflow enforces readiness and role gates identically to the original `fn_period_readiness`/`fn_reopen_period` behavior.
- [ ] **Full core-platform regression**: every test from Phases 1-9 re-run and passing against the same final MySQL database state — the PHP/MySQL equivalent of the "run all 6 SQL suites fresh" gate every original Postgres phase used.
- [ ] Full core migration (Auth through Investor Portal/Closing) declared PASS — the condition for this plan's own completion, separate from and prior to any P&L/Allocation/Distribution work being extended further or Cashflow being iterated on.

---

## Summary / What Happens Next

This plan sequences 10 phases so that each one is independently testable against a real MySQL database before the next begins, exactly mirroring the discipline that made Phases 1-5 of the original Postgres build reliable (real-infrastructure validation, a written report, an explicit stop for review). Cashflow (Phase 6) sits in the middle of the sequence, after core Journal/GL is proven and before P&L/Allocation/Distribution extend the accounting side further — reusing the shared platform throughout, never duplicating master data, never competing with General Ledger as a source of truth, per your instructions.

**No code has been written. Awaiting your review and approval of this implementation plan before Phase 1 begins.**
