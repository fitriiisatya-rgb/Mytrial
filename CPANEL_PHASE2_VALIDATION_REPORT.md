# cPanel MySQL Phase 2 Validation Report — Master Data

Builds on Phase 1 Core Foundation (PASS). Implements `CPANEL_MYSQL_IMPLEMENTATION_PLAN.md`'s Phase 2 for the PHP/MySQL track: Entity, Outlet, COA, Bank Account, Investor, Partnership Contract, and Investor Ownership, all production-ready under `php-app/`. No Phase 1 architecture was changed without strong reason — the two exceptions (documented under Bugs Found & Fixed) were both real, previously-latent bugs this phase's own test-writing surfaced, not redesigns.

## Pages Built

Full CRUD (list/search/filter/paginate, create, edit, detail) for all seven modules, one Controller/Service/Repository/view-set each, sharing the Phase 1 layout, RBAC, and audit infrastructure:

- `/master/entities` — Entitas
- `/master/outlets` — Outlet (+ ownership indicator, current/historical ownership on detail)
- `/master/coa` — Chart of Accounts (hierarchical, parent/children navigation)
- `/master/banks` — Rekening Bank (mandatory bank-specific COA)
- `/master/investors` — Investor (login-account-optional)
- `/master/contracts` — Kontrak Kemitraan
- `/master/ownerships` — Kepemilikan Investor (create + end-ownership; no edit — effective-dated and append-only)

Sidebar matches spec P exactly; every list is server-side searched/filtered/paginated (spec Q); every write route sits behind both a staff-only `RoleMiddleware` and, where the role set narrows further (banks/contracts/ownerships), a `PolicyMiddleware`.

## Tables / Migrations

`database/schema/0002_master_data.sql` — `entities`, `coa`, `outlets`, `banks`, `investors`, `partnership_contracts`, `investor_ownerships`, `accounting_periods` (schema only, no UI yet — reserved for Phase 5's period-lock guard per the approved implementation plan). All `InnoDB`/`utf8mb4`, `CHAR(36)` app-generated UUIDs, `DECIMAL(20,2)` money, `is_active`/`status` flags (spec A/N/O). Every index from spec O's list is present. One infra fix bundled in (see Bugs Found & Fixed): `audit_log.created_at` upgraded to `DATETIME(6)`.

`database/seeds/0002_master_data.sql` — demo entity/outlets/COA tree/banks/investors/contract/ownership-with-history, fixed UUIDs, local/CI/demo use only (documented as such, never appropriate to import as-is in production, same convention as Phase 1's seed).

## Entity

`code`/`name`/`status`, unique code enforced at the Service layer (checked before insert, not just relying on the DB `UNIQUE` constraint to fail loudly) and re-checked on update against every *other* row. Detail page shows outlet count and bank count. No delete route exists anywhere in the stack.

## Outlet

`code`/`name`/`entity_id`/`area`/`opening_date`/`partnership_start`/`partnership_end`/`status`. Detail page shows partnership dates, current investor count, and the ownership-total indicator (spec C): **exactly 100%** → green "valid" badge, **under 100%** → amber "warning," **over 100%** → red "invalid" (structurally shouldn't occur given the create-time guard, but the indicator computes it independently rather than assuming the guard is infallible). No 1-outlet-to-1-bank-account constraint exists anywhere (verified by a dedicated test — one entity's single bank account coexists with two outlets under it with no schema or Service-level tie between them).

## COA

Hierarchical (`parent_id` self-reference), `account_type`/`normal_balance`/`pnl_category`/`reporting_order`/`is_active`. **Circular-hierarchy prevention**: `CoaRepository::wouldCreateCycle()` walks the candidate parent's ancestor chain (bounded at 100 hops, refusing rather than looping forever on any already-corrupt chain) before an update is allowed to change `parent_id` — verified live: attempting to make a parent account a child of its own child is rejected with a clear form error, and the hierarchy is confirmed unchanged afterward. Deactivate-only, never hard-delete (no delete route exists).

## Bank Account

**Critical module, built with the most defense-in-depth**: `coa_id` is `NOT NULL` at the schema level, required at the Service-validation level, and additionally checked for uniqueness *before* insert (`BankRepository::findByCoaId()`) so a form submission gets a clear "this COA is already used by another bank account" message rather than a raw DB constraint-violation page. `uq_banks_coa_id` (a real `UNIQUE` index) is the actual, unbypassable enforcement underneath — the Service-level check is a UX courtesy, not the security boundary. Verified live: a bank without a COA is rejected; attempting to reuse an already-claimed COA (even on a *different* bank) is rejected with the exact spec-E scenario (`BCA Operasional A` and `BCA Operasional B` each get their own dedicated COA — never a shared generic "Kas & Bank").

## Investor

`code`/`full_name`/`email`/`phone`/`profile_id` (nullable)/`status`. **spec F, verified**: an investor can be created with zero login account — `profile_id` is never required anywhere in the validation or schema — and the list/detail pages show a "Belum memiliki akun login" badge for exactly that case. If a `profile_id` *is* supplied, it must reference a real `profiles` row (checked, not blindly trusted). Detail page shows active investment count and full ownership history.

## Contract

`contract_number`/`outlet_id`/`start_date`/`end_date`/`duration_months`/`total_investment`/`profit_distribution_pct`/`retained_profit_pct` (MySQL `GENERATED ALWAYS AS (100 - profit_distribution_pct) STORED` — verified live: setting distribution to 70% correctly and automatically computes retained as 30%, confirmed via `SHOW CREATE TABLE`). `end_date > start_date` and `0 ≤ distribution_pct ≤ 100` enforced both at the MySQL `CHECK`-constraint level (confirmed live: MariaDB 10.11 genuinely *enforces* `CHECK`, not silently accepts-and-ignores it the way older MySQL 5.7 would — this was explicitly flagged as a version-dependent risk in `MIGRATION_TO_CPANEL_MYSQL_PLAN.md` §2 item 12, and is now positively confirmed safe on this target version) and independently at the Service layer (so the user sees a friendly message, not a raw SQL error). Default 5-year (60-month) duration is a UI default value only, never a hardcoded constraint — any duration can be entered (spec G).

## Ownership — the critical module

Effective-dated, append-only: `investor_id`/`outlet_id`/`contract_id`/`ownership_pct`/`investment_amount`/`effective_from`/`effective_to`/`is_active`. **There is no update/edit route or Repository method for an existing row's substantive fields** — the only mutation ever applied to an existing row is `end()` (sets `effective_to` + `is_active = 0`); a genuine ownership change is always "end the old row, then create a new one," two separate, auditable actions (spec H/J).

**The >100% guard (spec I) is transaction-safe, not just request-safe**: `OwnershipService::create()` runs inside one `Connection::transaction()` closure that `SELECT ... FOR UPDATE`-locks every ownership row for the target outlet whose date range overlaps the new row's `[effective_from, ∞)` *before* summing percentages. A plain "check then insert" (no lock) would have a race window between two concurrent requests; the lock closes it, because a second transaction attempting the same `FOR UPDATE` on an overlapping row physically blocks until the first transaction commits or rolls back.

**"Current as of a date" is deliberately date-range-only, not `is_active`-gated** — this exactly mirrors the original Postgres `fn_ownership_as_of`'s own documented reasoning (`is_active` means "not superseded in today's bookkeeping," not "was this the row in force on the date in question"). This was caught as a real bug during manual smoke-testing (see Bugs Found & Fixed #1) before it reached the test suite.

## Ownership History

Outlet detail: current investors (name, %, investment, start date), running total-ownership badge, full historical table (every row, including ended ones, with period and status). Investor detail: symmetric — active investments and full investment history by outlet. Both confirmed live against the seed data's deliberately-constructed two-period Budi Santoso scenario (20% 2024–2026, then 15% 2027 onward) and against test-created scenarios exercising the exact 100%/warning/rejection boundaries.

## RBAC

Two independent layers on every write route, per spec K's "jangan hanya hide tombol":
1. **Route-level `RoleMiddleware`** — every `/master/*` route (read included) requires one of `super_admin`/`accounting`/`finance_manager`/`management`; investor is structurally never in that list, so there is no `/master/*` URL an investor session can reach, confirmed for all seven modules individually (not just one representative route).
2. **`PolicyMiddleware`** on write routes — mirrors the original app's `WRITE_ROLES` map: entities/outlets/coa/investors allow `management`; banks/contracts/ownerships do not (finance-sensitive actions, accounting/finance_manager/super_admin only). Verified live for every module, both the allow and the deny side.

## Audit

`AuditService::log()` (Phase 1 infrastructure, reused unchanged) called from every listed spec-M action: entity/outlet/bank/COA/investor/contract create+update, ownership create ("create ownership") and end ("close/end ownership"). Actor, action, entity_table, entity_id, and old/new value JSON all confirmed present and correct in dedicated tests, including a create-then-update sequence proving the *right* actor is attributed to each step and old/new values genuinely reflect the before/after state (not just "some JSON exists").

## MySQL Validation

All of the following verified against a **real, locally-installed MariaDB 10.11 instance** (never mocked, matching every prior phase's discipline):

- Schema installs cleanly from a completely empty database via raw SQL (the phpMyAdmin-import-equivalent path) — verified twice independently during this phase.
- Every FK relationship (`outlets→entities`, `banks→entities`+`coa`, `partnership_contracts→outlets`, `investor_ownerships→investors`+`outlets`+`partnership_contracts`+`profiles`, `coa→coa` self-reference) confirmed working via the seed data's own successful insert (FK violations would have failed the seed).
- `UNIQUE` constraints confirmed live: duplicate entity/outlet code, duplicate bank name+account combo, duplicate `coa_id` on `banks`, duplicate contract number — all rejected with real MySQL constraint errors, each also caught and converted to a friendly Service-layer message before the user ever sees a raw DB error.
- **Transaction rollback confirmed**: an `OwnershipTotalExceededException` thrown inside `Connection::transaction()`'s closure correctly rolls back the entire transaction (the `lockOverlappingActiveForOutlet` read is never left with side effects, and the rejected `create()` call leaves zero trace in the database — verified by re-querying the outlet's total immediately after a rejected attempt).
- **Ownership total guard confirmed under real concurrency**, not simulated: `tests/Feature/OwnershipConcurrencyTest.php` spawns two genuinely separate OS processes (`proc_open`) against the same test database, targeting the same outlet with percentages that together exceed 100%, with a deliberate lock-hold delay in one process to guarantee the second blocks on the first's `FOR UPDATE`. Run repeatedly (4 times during this validation): exactly one process succeeds and one is rejected every time, and the final database state is always exactly 60% — never 120%, never 0%.
- Audit rows confirmed written with microsecond-precision ordering (the `DATETIME(6)` fix).

## cPanel Compatibility

- `composer.json`'s runtime `require` remains **PHP-version-only** (`>=8.1`) — Phase 2 added zero third-party packages, same as Phase 1.
- No Node runtime, no Redis, no persistent worker, no Docker, no Supabase/Postgres dependency anywhere in the new code (confirmed by the same dependency-audit grep used in Phase 1's report — every match is a comparison comment against the original system, never a live reference).
- Schema/seed files are plain, portable SQL importable via phpMyAdmin exactly as documented in `CPANEL_DEPLOYMENT_NOTES.md`'s existing "Database setup" steps (Phase 3 onward will extend that document; nothing about Phase 2 changes those steps).
- Every new page renders through the same `public/index.php` front controller and `resources/views/layouts/app.php` layout Phase 1 established — no new deployment surface.

## Bugs Found & Fixed

1. **"Current ownership" incorrectly gated on `is_active` in addition to date range.** First draft's `currentSql()` (and the >100% guard's overlap lock) filtered on `is_active = 1` *and* the date range. Caught via manual smoke-testing against the seed data's own advance-dated ownership-change scenario (an ownership row end-dated in the future, with `is_active` already flipped to 0 the moment the replacement row was created): the outlet's "current" total incorrectly excluded a row that was still genuinely in force today. **Fixed** by making every "current as of a date" query (and the concurrency-guard's lock) pure date-range math, exactly mirroring the original Postgres `fn_ownership_as_of`'s own documented reasoning that `is_active` means "not superseded in today's bookkeeping," never "was this the row in force on the date in question." Re-verified: the seed data's Budi Santoso two-period scenario now correctly shows 35% (not 15%) as of the sandbox's current date.
2. **Repeated named PDO placeholder in every module's search query** (`(code LIKE :search OR name LIKE :search)` — the exact same `PDOException: SQLSTATE[HY093] Invalid parameter number` class of bug first found in Phase 1/`OwnershipRepository`, but this time in five *separate* repositories' search-filter code, none of which had ever been exercised with a non-empty search term by any earlier manual smoke test). **Caught by `SearchPaginationTest.php`** — the first test in this phase to actually call `count()`/`paginate()` with a real search string. **Fixed** across `EntityRepository`, `OutletRepository`, `CoaRepository`, `BankRepository`, `InvestorRepository` — each `LIKE` clause now gets its own uniquely-named placeholder bound to the identical value. Re-verified live via curl against the running app (search for "Amor" on Entities, "BCA" on Banks) after the fix, not just via the unit test.
3. **MySQL DATETIME's 1-second resolution risked ambiguous audit-row ordering** for two rows written within the same request (e.g. a create-then-update test sequence). Caught while writing `MasterDataAuditTest.php`'s before/after-value assertions. **Fixed**: `audit_log.created_at` upgraded to `DATETIME(6)` (microsecond precision) via an `ALTER TABLE` bundled into `0002_master_data.sql` with a clear comment explaining why (this is the one place Phase 1's own migration file's *effective* behavior changed — the file itself, `0001_core_foundation.sql`, was left untouched, since editing an already-applied/committed migration in place is the wrong fix; the correction ships as a normal forward migration step, exactly the discipline `CPANEL_MYSQL_IMPLEMENTATION_PLAN.md`'s Database Transaction Strategy section describes for schema evolution).
4. **`out` used as a MySQL table alias** (`outlets out`) in two `OwnershipRepository` queries — `OUT` is a MySQL reserved word, causing a syntax error the instant those queries were ever reached (investor detail's ownership history). Caught immediately on first live smoke test of the Investor detail page. **Fixed**: alias renamed to `ot`.

None of these were design flaws in the *business rules* (the >100% guard's logic, the audit trail's shape, the search feature's intent were all correct from the start) — all four were MySQL-specific or PDO-specific mechanics that don't exist the same way in the original Postgres implementation, caught by writing and running real tests and real smoke tests against real MariaDB rather than by static review, consistent with every prior phase's validation discipline.

## Remaining Risks

1. **No real cPanel account was available to test the actual phpMyAdmin-import/upload flow end-to-end for the Phase 2 schema specifically** — same caveat as Phase 1's report; the schema is plain, portable SQL with no exotic syntax, and was verified against a real MariaDB 10.11 server, but the specific hosting provider's phpMyAdmin version/import UI remains unverified until a real deployment.
2. **COA hierarchy display is a flat, paginated, code-sorted list** (parent-child relationships shown as a "Parent" column + a detail-page children list), not a collapsible nested tree — a deliberate tradeoff since spec Q's server-side-pagination requirement and a true nested tree view are in some tension at scale; judged acceptable given COA account counts are realistically in the dozens-to-low-hundreds, not large enough to need virtualized tree UI, and every parent-child relationship is still fully navigable by clicking through.
3. **The Ownership create form's outlet→contract filtering is client-side JavaScript** (all active contracts are embedded in the page and filtered on `<select>` change) rather than a server round-trip — simple and fast for realistic data volumes (spec P's "accounting 1 orang bisa bekerja cepat" priority), but would need revisiting if the number of active contracts ever grew very large.
4. **`accounting_periods` has no UI yet** (schema only, per the approved implementation plan's own sequencing — its management screen and period-lock enforcement are Phase 5's concern, once Journal/GL exists to actually need locking against).

## Gate

- [x] PHP lint PASS — 74/74 files, 0 syntax errors
- [x] Unit/integration tests PASS — 60/60 PHPUnit tests, 171/171 assertions, 0 failures (covers all 20 required scenarios from spec R plus positive-control counterparts)
- [x] MySQL migration fresh install PASS — verified twice against a completely empty MariaDB 10.11 database
- [x] RBAC tests PASS — investor denied every module (read and write), management's narrower banks/contracts/ownerships denial confirmed, accounting/finance_manager/super_admin full access confirmed
- [x] Ownership tests PASS — ≤100% success, >100% rejection, non-overlapping-period independence, historical-row-never-overwritten, already-ended-row-rejected, history-preserved-after-ending, zero/negative-pct rejection, **and genuine multi-process concurrency** (4 repeated runs, 0 flakes)
- [x] Direct URL security PASS — unauthenticated request rejected (401), investor direct URL rejected (403) for all 7 modules read and write, verified via both PHPUnit and live curl smoke tests
- [x] No secret committed — `.env`/`.env.testing`/`vendor/`/`.phpunit.result.cache`/log files all confirmed `.gitignore`d and absent from `git status` staging
- [x] No production-breaking dependency — `composer.json` runtime `require` remains PHP-version-only; zero Node/Redis/Docker/Supabase/Postgres references outside comparison comments

**FINAL STATUS: PASS**

cPanel MySQL Phase 2 Master Data PASS. Ready for Phase 3 Import.
