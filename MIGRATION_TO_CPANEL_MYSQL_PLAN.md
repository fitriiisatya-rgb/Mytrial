# Migration Plan — Partnership Finance System → PHP + MySQL on cPanel

**Status: PLANNING ONLY. No rewrite has started.** This document is the deliverable requested before any Phase 6 or migration work begins. Development is paused pending your review.

## Why this document exists

The current system (Phases 1-5, all PASS) is built on Next.js 14 + Supabase/PostgreSQL, deployed conceptually toward Vercel + Supabase's managed Postgres. The new deployment target is a standard cPanel shared-hosting account: PHP 8.x, MySQL/MariaDB, phpMyAdmin, upload-and-go, no Docker, no persistent Node process, no guaranteed SSH. These two stacks are not just "similar with different syntax" — a meaningful fraction of the current system's *correctness guarantees* (RLS, PL/pgSQL trigger-enforced invariants, partial unique indexes) are implemented using PostgreSQL/Supabase features that have no direct MySQL/cPanel equivalent. This plan identifies exactly what reuses cleanly, what must be rewritten, how, and what the risk is at each point — before a single line of PHP is written.

---

## 1. Existing Architecture Audit

**Stack today:**
- Next.js 14.2 (App Router, Server Components + Server Actions) — no separate REST/GraphQL API layer; almost every mutation is a `"use server"` action colocated with its page.
- `@supabase/ssr` + `@supabase/supabase-js` for auth (GoTrue), the Postgres client, and session cookies (`lib/supabase/{client,server,admin,middleware}.ts`).
- PostgreSQL 16, 17 migrations (`0001`-`0017`), applied via `supabase db reset` / plain `psql`.
- TypeScript throughout, hand-maintained `types/database.types.ts` mirroring the schema for compile-time query safety.
- `googleapis` (Node) for Google Sheets sync (Cashflow module); an unattended `/api/cashflow/cron-sync` route intended to be hit by an external scheduler (Vercel Cron or `crontab + curl`).

**Scale, measured directly from this repo:**
- 40 tables across 17 migrations.
- 12 PostgreSQL `ENUM` types.
- 23 PL/pgSQL functions (mix of: role/self-identity helpers, ~10 trigger functions enforcing invariants, ~9 callable "guarded workflow" functions like `fn_review_journal`/`fn_publish_pnl`/`fn_reopen_period`).
- 20 triggers.
- 4 views (`v_posted_journal_lines`, `v_cashflow_running_balance`, `v_bank_account_balance`, `v_bank_accounts_public`).
- 1 sequence (`seq_journal_number`).
- 80 Row Level Security policies across `0008`, `0009`, `0014`, `0016`, `0017`.
- 4 filtered/partial unique or dedupe indexes (see §2).
- ~16,200 lines of TypeScript across `app/`, `lib/`, `components/`.
- 6 SQL integration-test suites (102 assertions) + 160 Node-native unit tests (`lib/**/__tests__`).

**Modules present today** (all in scope for the PHP/MySQL rebuild, per your list): Auth, Entity, Outlet, Bank Account, COA, Investor, Partnership Contract, Ownership, Transaction Import, Mapping Engine, Exception Center, Auto Journal, General Ledger, Trial Balance, Allocation, Profit Distribution (P&L is architecturally ready — Phase 6 — but not yet built), Investor Portal, Audit Trail, Period Closing — plus the pre-existing **Cashflow Management System** module (its own 6 migrations, 15 unit tests, full UI under `/cashflow/*`), which the target list does not explicitly name but which currently ships in the same codebase and must be accounted for in the migration (see §9).

**Architectural pattern worth preserving, not just the code:** every phase of this project used the same discipline — *one pure business-logic function, called from every entry point* (`lib/mapping/engine.ts`, `lib/journal/build-*.ts`, `lib/money.ts`). None of that logic touches Supabase directly; it takes plain objects/BigInts in, returns plain objects out. This is exactly the layer that survives a stack change unmodified in *behavior*, even though its *syntax* has to move from TypeScript to PHP.

---

## 2. PostgreSQL/Supabase Dependencies (the things with no direct MySQL/cPanel equivalent)

| # | Feature | Used for | MySQL/cPanel reality |
|---|---|---|---|
| 1 | **Row Level Security (80 policies)** | Every table's authorization boundary — investor sees only their own outlet/ownership, staff roles scoped by table, `anon`/`authenticated`/`service_role` role model | MySQL has no RLS concept at all. This is the single largest rewrite — see §7. |
| 2 | **Supabase Auth (GoTrue)** | Login, session cookies, `auth.uid()`/`auth.role()` inside SQL | Must become custom PHP session auth + a `profiles`-equivalent table with `password_hash()` |
| 3 | **23 PL/pgSQL functions**, several `SECURITY DEFINER`-style (bypass RLS to read your *own* role safely) | Guarded workflow transitions (review/approve/post/reverse journal, publish P&L, reopen period), invariant checks | No stored-procedure equivalent is safe to rely on: many cPanel MySQL accounts run with the `TRIGGER`/routine-creation privilege revoked for the app's DB user, and stored-procedure debugging via phpMyAdmin is painful. **Recommendation: move all of this into PHP service-layer code**, not MySQL triggers/procedures (see §7). |
| 4 | **20 triggers** enforcing invariants at the moment of write (balance-must-equal, posted-immutable, period-lock, ownership-total ≤ 100%, distribution-snapshot-immutable, `updated_at` touch) | Defense-in-depth so a bug in the app layer can't corrupt the ledger | Same reasoning as #3 — reimplemented as PHP service-layer validation *inside a DB transaction*, never assumed to be enforced by MySQL itself. `updated_at` touch triggers are the one category MySQL can genuinely replace natively (`ON UPDATE CURRENT_TIMESTAMP`), no PHP needed. |
| 5 | **12 `ENUM` types**, several extended mid-project (`exception_type` gained 3 new values across Phases 3-4-5 via `ALTER TYPE ... ADD VALUE`) | Type safety on status/category columns | MySQL `ENUM` exists but altering it is a full `ALTER TABLE ... MODIFY COLUMN` (more disruptive than Postgres's `ADD VALUE`, and this schema has *already* shown a pattern of growing its enums twice). **Recommendation: `VARCHAR(n)` + a `CHECK` constraint** for any enum with a history of growth (`exception_type`, `journal_source_type`) so a future addition is a one-line constraint edit, not a column-type rewrite; plain MySQL `ENUM` is fine for genuinely stable ones (`normal_balance`, `account_type`). |
| 6 | **Partial/filtered unique indexes (4 found)** | `uq_journal_source_active` (idempotent journal generation, condition: `status <> 'reversed' and reversal_of_id is null`), `uq_cashflow_alerts_open_dedupe` (`where status = 'OPEN'`), `uq_bank_accounts_sheet_label` (`where sheet_label is not null`), `uq_allocation_bank_transaction` (`where bank_transaction_id is not null`) | MySQL/MariaDB have **no partial/filtered index syntax at all**. This is a real, easily-missed gap. **Fix**: for the trivial case (`uq_allocation_bank_transaction`, condition is exactly "the indexed column is not null") — no change needed; MySQL unique indexes already permit unlimited `NULL`s natively, which is the same behavior. For the other three, add a **generated/computed column** that evaluates to the natural key when the row should be counted and to `NULL` otherwise, then put a plain `UNIQUE` index on *that* column (MySQL/MariaDB allow multiple `NULL`s in a unique index — this is the standard portable trick). E.g. for `uq_journal_source_active`: `active_source_key VARCHAR(80) GENERATED ALWAYS AS (CASE WHEN status <> 'reversed' AND reversal_of_id IS NULL THEN CONCAT(source_type, ':', source_id) END) STORED`, unique-indexed. |
| 7 | **1 sequence** (`seq_journal_number`, feeding a `before insert` trigger that formats `JRN-YYYY-MM-NNNNNN`) | Concurrency-safe, deterministic journal numbering, reset conceptually per month | MariaDB 10.3+ has `CREATE SEQUENCE`, but this cannot be assumed present on an arbitrary cPanel host (version varies widely, and plain MySQL never got sequences). **Recommendation**: a small `document_number_counters` table keyed by `(scope, year, month)` with an atomic `SELECT ... FOR UPDATE` + increment inside the same PHP transaction that inserts the journal header — portable across MySQL and every MariaDB version. |
| 8 | **`jsonb` columns (18 across the schema)**, mainly `audit_log.old_value`/`new_value` snapshots | Structured before/after audit payloads | MySQL 5.7+/MariaDB 10.2+ both have a native `JSON` column type with no functional gap for this use case (no GIN indexing needed here — it's write-once, read-by-id). Direct port. |
| 9 | **2 extensions** (`uuid-ossp`, `pgcrypto`) generating UUIDs at the DB layer (`uuid_generate_v4()`) | Primary keys on all 40 tables | No MySQL extension needed — see §5 for the UUID strategy. |
| 10 | **`timestamptz`** everywhere | Point-in-time audit/workflow timestamps | MySQL `DATETIME` has no timezone awareness. **Convention**: store everything as UTC in `DATETIME(6)`, convert for display in PHP — the same discipline the app already effectively follows (Supabase stores UTC internally regardless). |
| 11 | **`googleapis` (Node client library)** for the Cashflow module's Google Sheets sync, plus a Next.js API route as the cron entry point | Scheduled bank-transaction sync from a shared Google Sheet | Rewritten as a **PHP CLI script** invoked directly by a cPanel Cron Job (`php /home/.../cron/sync_sheets.php`), reading the sheet's public CSV export URL via `curl`/`file_get_contents` — no OAuth, no persistent process, matches your own suggested approach. |
| 12 | **CHECK constraints (~50 across migrations)** | Money non-negativity, debit/credit exclusivity, status-value guards, etc. | MySQL 8.0.16+ and MariaDB 10.2+ enforce `CHECK` constraints natively; **older MySQL 5.7 silently accepts and ignores them** — a real trap if the host's DB version is older. **Mitigation**: never rely on the DB `CHECK` as the only enforcement — every one of these rules is re-implemented in the PHP service layer regardless (this was already the project's discipline: "frontend validation alone is insufficient," now it becomes "DB-only enforcement alone is insufficient either, confirm the DB engine version before trusting it as a second line of defense"). |

---

## 3. What Can Be Reused (as-is or near-as-is)

**Fully reusable, logic unchanged — only the host language changes (TS → PHP):**
- `lib/money.ts` — the sen-integer (BigInt) money model and `allocateProportionally()`/`allocateEqually()` largest-remainder algorithm. PHP has native 64-bit integers (ample headroom for Rupiah-in-sen at any realistic company scale) or `bcmath`/`gmp` if arbitrary precision is ever needed. This is a line-by-line port, not a redesign.
- `lib/import/*` — spreadsheet parsing, column mapping, row classification, dedupe-key/fingerprint logic, date/money string normalization. All pure functions operating on parsed rows; the parsing library changes (`xlsx` npm package → `PhpSpreadsheet` via Composer, or a lighter CSV-only path — see §7), the classification rules do not.
- `lib/mapping/*` — the rule-matching engine (priority + specificity resolution, ambiguous-match detection, interbank/shared-cost keyword heuristics, learning a rule from a resolved exception). Pure logic, ports directly.
- `lib/journal/*` — all five journal builders (bank expense, revenue, shared cost, interbank transfer, manual) plus `checkBalance()`. This is the accounting engine's core and the most business-critical code in the repo; it is also the most mechanically portable, because it was deliberately kept side-effect-free from day one.
- **The schema's shape** (table names, columns, relationships, constraints) — reused as the source of truth for the MySQL `schema.sql`, translated per §2/§5, not redesigned from scratch.
- **The 160 unit tests' *assertions*** (not their Node/tsx runner) — every test case (Rp100/3 largest-remainder, zero-weight-outlet filtering, ambiguous-pairing-never-guessed, unbalanced/0-0/negative rejection, etc.) states a business rule that must still hold in PHP; they define the PHPUnit/Pest test list, not just prior art.
- **The 6 SQL suites' *test scenarios*** (idempotency, balance guard, closed-period rejection, reversal correctness, unauthorized-investor-access) — same relationship: the assertions are the spec, re-expressed against MySQL.
- **UI/UX flow and page structure** — every module's page layout, filter set, workflow buttons, and bulk-action pattern (the `form="id"` HTML trick used repeatedly) is a validated design; it is reused as the target Blade/PHP-template layout, not redrawn from scratch.

**Reusable with light adaptation:**
- `PHASE1-5_VALIDATION_REPORT.md` files — the *business rules and edge cases they documented* (30 exception types, 24+ journal test scenarios, ownership effective-dating rules) are the requirements spec for the PHP rebuild's own validation report.

---

## 4. What Must Be Rewritten (no shortcut)

1. **The entire authorization layer (RLS → PHP).** Every one of the 80 policies becomes an explicit, testable check in a PHP authorization layer. This is not optional and not smaller in PHP than it was in SQL — if anything it needs *more* discipline, because there is no database-level backstop if a controller forgets to call it. See §7.
2. **Every PL/pgSQL function (23) and trigger (20)** — reimplemented as PHP service methods running inside explicit `PDO` transactions. The "guarded function + trigger" pattern (Phase 1's `fn_publish_pnl`/`fn_guard_pnl_publish`, reused for every Phase 5 workflow transition) becomes: a `Service` class method that (a) checks the caller's role, (b) checks the current state, (c) performs the write(s) inside one transaction, (d) writes the audit-log row — all in application code, with no DB trigger able to silently allow a bypass through a raw `UPDATE`.
3. **Supabase Auth → custom PHP auth.** Login form, `password_hash()`/`password_verify()`, PHP session handling (`session_regenerate_id(true)` on login, `httponly`+`secure`+`samesite` cookies), password reset flow, and a `profiles`-equivalent table now storing the password hash directly (Supabase's `auth.users` no longer exists to hold it).
4. **All 18 Server Actions files** (`app/**/actions.ts`) → PHP Controllers + Services. This is mechanical but large: every mutation currently colocated with its Next.js page becomes an explicit route + controller method.
5. **The Google Sheets sync** (`lib/cashflow/googleSheets.ts` + `syncService.ts`, the `googleapis` Node dependency) → a PHP CLI script using the sheet's public CSV export URL, invoked by a cPanel Cron Job.
6. **`types/database.types.ts`** — the hand-maintained TypeScript type layer has no PHP equivalent need; PHP is dynamically typed at this boundary, so this file's *purpose* (catching a wrong-column-name query at compile time) is replaced by disciplined Repository classes + PHPUnit tests, not a 1:1 artifact.
7. **The 6 `.sql` integration test suites** — rewritten against MySQL/MariaDB (no `auth.uid()`/GUC-based role emulation equivalent — PHP-side authorization means these tests move from "SQL script asserting what RLS allows" to "PHPUnit/Pest feature tests asserting what the Service/Controller layer allows," which is arguably a more faithful test of what actually protects the data in the new architecture).
8. **Spreadsheet parsing library** — `xlsx` (npm) → `PhpSpreadsheet` (Composer) if Excel input must be supported; if the real-world import is CSV-only in practice (confirm with you), a native PHP CSV path avoids the Composer dependency entirely (see §7 framework discussion).

---

## 5. MySQL Schema Plan

- **Engine**: `InnoDB` for every table (transactions + foreign keys required for the accounting invariants).
- **Charset/collation**: `utf8mb4` / `utf8mb4_unicode_ci` throughout (Indonesian text, Rupiah formatting with "Rp" and thousands separators must round-trip correctly).
- **Primary keys / UUIDs**: `CHAR(36)` storing a standard UUIDv4 string (`xxxxxxxx-xxxx-...`), generated in PHP (`random_bytes` + formatting, or Composer's `ramsey/uuid` if available) at insert time — **not** `BINARY(16)`. You asked for "the simpler approach for cPanel," and `CHAR(36)`: (a) is directly readable in phpMyAdmin and in every existing SQL test's fixed literal UUIDs (all Phase 1-5 test fixtures use fixed UUID strings like `'90000000-0000-0000-0000-000000000001'` — these transfer unchanged), (b) needs no `BIN_TO_UUID()`/`UUID_TO_BIN()` conversion at every query boundary, (c) costs a predictable, acceptable amount of extra index size at this system's realistic scale (tens of thousands of journal lines, not billions of rows). `BINARY(16)` is faster/smaller but adds a conversion step to *every single query* across a 40-table schema — not worth it here.
- **Money**: `DECIMAL(20,2)` (matches your instruction; Postgres used `NUMERIC(18,2)`, `DECIMAL(20,2)` gives headroom without any real cost). Never `FLOAT`/`DOUBLE`. Application-side arithmetic continues the sen-integer (BigInt-equivalent) discipline from `lib/money.ts`, ported to PHP.
- **Dates/times**: `DATE` for calendar dates (accounting periods, journal dates, ownership effective-dates); `DATETIME(6)` for audit/workflow timestamps, always written/read as UTC by convention.
- **Enums**: `VARCHAR` + `CHECK` for any enum with a history of growing (`exception_type`, `journal_source_type`, `import_source_type`); plain MySQL `ENUM` acceptable for stable ones (`user_role`, `account_type`, `normal_balance`, `period_status`, `pnl_status`, `distribution_status`, `journal_status`, `allocation_method`, `match_type`, `exception_status`).
- **JSON**: native `JSON` type for `audit_log.old_value`/`new_value` and any other structured snapshot column — 18 current usages, all write-once/read-by-id, no functional gap.
- **Foreign keys**: ported 1:1 from the existing schema's `references` clauses, same `ON DELETE`/`ON UPDATE` semantics (mostly `RESTRICT`, a few `CASCADE` for genuinely dependent rows like journal lines under a header).
- **Filtered uniqueness**: the generated-column trick from §2 item 6, applied to the 3 non-trivial cases.
- **Sequences**: the `document_number_counters` table + `SELECT ... FOR UPDATE` pattern from §2 item 7, for journal numbering (and any future document-numbering need).
- **Views**: `v_posted_journal_lines`, `v_cashflow_running_balance`, `v_bank_account_balance`, `v_bank_accounts_public` all port directly — MySQL views support the same `SELECT`-with-`JOIN`/`WHERE` shapes these use, no rewrite needed beyond syntax.
- **Deliverable**: a single `database/schema.sql` importable via phpMyAdmin in one shot (per your deployment steps), plus `database/migrations/*.sql` as the incrementally-numbered history (mirroring the existing `0001`-`0017` numbering and intent, so the audit trail of *how the schema evolved* is preserved, not flattened away), plus `database/seeds/*.sql` mirroring `supabase/seed.sql`.

---

## 6. PHP Application Architecture

Target structure (matches what you specified):

```
/app
  /Controllers      one per module (JournalController, MappingController, ...)
  /Models            thin data-shape classes (not ActiveRecord — see below)
  /Services          the ported business logic: JournalWorkflowService,
                     MappingEngineService, MoneyService, AllocationService...
  /Middleware        AuthMiddleware, RoleMiddleware, CsrfMiddleware
  /Repositories      all SQL lives here, behind an interface per aggregate
                     (JournalRepository, OwnershipRepository, ...) — this is
                     the layer that replaces "just query the table, RLS
                     will handle it": every method here takes the current
                     user/role explicitly and scopes its own WHERE clause.
  /Helpers           Money (sen<->Rupiah), Uuid, DateTime, AuditLogger
/config
  app.php, database.php (reads from .env)
/database
  schema.sql, migrations/, seeds/
/public
  index.php            <- single front controller / router entry point
  assets/
/resources
  views/                per-module templates
/storage
  logs/, uploads/        writable, outside version control
/tests
  Unit/                  ports the 160 lib/**/__tests__ cases
  Feature/               ports the 6 SQL suites' scenarios as HTTP/Service-level tests
```

**Why Repository-scoped-by-role, not a global "current user" singleton read inside SQL:** RLS's actual guarantee was "the database itself refuses to return a row the caller isn't allowed to see, no matter which code path asked." PHP has no equivalent backstop. The closest disciplined substitute is: **every Repository method that reads or writes a row takes the acting user's role/id as an explicit parameter and is unit-testable in isolation** (call `OwnershipRepository::listForInvestor($investorId, ...)` and it is *structurally impossible* to return another investor's row, because the SQL it runs is parameterized by that id, not a global "trust the caller already checked" assumption). Controllers must never run a raw query themselves — this is the discipline that makes "authorization enforced server-side, not just hidden UI" actually true rather than aspirational.

**Framework decision — see §7 below**, but the directory shape above works essentially unchanged whether the choice is Laravel or structured native PHP; Laravel's own conventions (`app/Http/Controllers`, `app/Models`, `app/Providers`) are close enough to this that adopting Laravel later, if ever needed, is a rename, not a redesign.

---

## 7. Auth / RBAC Replacement

**Session & login:**
- `profiles` table gains a `password_hash` column (currently absent — Supabase Auth held this). New users are created with `password_hash($password, PASSWORD_BCRYPT)` (or `PASSWORD_ARGON2ID` if the host's PHP build has it); login verifies with `password_verify()`.
- PHP native sessions, `session.cookie_httponly=1`, `session.cookie_secure=1` (once HTTPS is confirmed on the domain), `session.cookie_samesite=Lax`, `session_regenerate_id(true)` immediately after successful login (fixation protection).
- CSRF: one token per session, embedded as a hidden field in every form, verified on every POST before the Controller runs — a `CsrfMiddleware` that runs before route dispatch, not a per-page afterthought.

**Role model (unchanged from today):** `super_admin`, `accounting`, `finance_manager`, `management`, `investor` — same five roles, same relative authority.

**Centralized permission layer (replacing RLS):**
- A `Gate`/`Policy`-style helper (`lib/Helpers/Authorize.php` in native PHP, or Laravel's own `Gate`/`Policy` classes if that framework is chosen) with one function per (resource, action) pair — e.g. `Authorize::can($user, 'journal.approve')`, mirroring `lib/supabase/permissions.ts`'s existing `WRITE_ROLES` map almost exactly (that file's comment already says "RLS is the actual boundary, this map is UX-only" — in the new architecture, this map graduates from UX-only to the actual boundary, and must be called from every Controller action, not just used to hide a button).
- **Row-level scoping (the harder half of what RLS did)**: RLS didn't just gate *actions* ("can this role write to this table"), it gated *which rows* a query could even see (investor A cannot read investor B's ownership row, full stop, at the database level). This half has no shortcut — every Repository method touching investor-scoped data (ownerships, distributions, published P&L, investor-visible bank-account balances) must resolve `user → investor → ownership → outlet → effective period` **inside the query itself** (a `WHERE outlet_id IN (subquery scoped to this investor's active ownerships as of today)`), exactly as your requirement states, never as a post-fetch filter and never assumed satisfied because the UI only shows a menu item for the outlets the investor "should" see.
- **Verification discipline**: every existing SQL RLS test (`test_rls.sql`'s `investorA_cannot_read_investorB_ownership`, `investorA_cannot_read_outletB_row`, `investorA_cannot_read_raw_journal_lines`, etc. — 23 assertions) becomes a PHPUnit/Pest feature test that logs in as investor A (or forges the session state directly) and asserts a 403/empty-result when trying to read or manipulate investor B's / another outlet's data by changing the URL parameter or POST id — directly exercising the exact attack your requirement calls out ("Investor tidak boleh bisa akses data outlet lain dengan mengubah URL/ID request").

---

## 8. Migration Risk

| Risk | Severity | Mitigation |
|---|---|---|
| **Row-level authorization regression** — a Controller/Repository forgets a scope check that RLS used to catch automatically | **High** | No DB backstop exists anymore, so this is the top risk. Mitigate with: mandatory Repository-layer scoping (never raw queries in Controllers), a full port of all 23 `test_rls.sql`-equivalent assertions before Phase 6, and a code-review rule that any new Repository method touching investor/outlet data must state its scoping in its own name/docblock. |
| **Silent CHECK-constraint no-op on an older MySQL/MariaDB** | **Medium** | Confirm the actual cPanel MySQL/MariaDB version before relying on DB-level `CHECK` at all; treat every constraint as PHP-service-layer-enforced primarily, DB-level as best-effort secondary only. |
| **Partial-unique-index translation bug** (the generated-column trick, §2 item 6) — get the `CASE WHEN` condition subtly wrong and idempotency/dedupe silently breaks | **High** (this exact class of bug already bit Phase 5 twice during the original Postgres implementation — see `PHASE5_VALIDATION_REPORT.md`'s Bugs #2/#3) | Port the *exact* SQL test scenarios that caught those two bugs originally (`07_corrected_journal_after_reversal_succeeds`, the reversal-doesn't-permanently-block-correction case) as the first tests written against the new MySQL schema, before any application code depends on it. |
| **Journal-number counter race condition** under concurrent requests (shared hosting = no persistent worker to serialize this) | **Medium** | `SELECT ... FOR UPDATE` inside the same transaction as the insert, on the counter row — this is the standard, portable pattern and was already the plan in §2 item 7; must be load-tested with concurrent requests before trusting it. |
| **Composer/SSH availability is unconfirmed** on your specific cPanel plan | **Medium**, blocks the framework decision | See §10 — resolved by you confirming, or by defaulting to the SSH/Composer-free path. |
| **Google Sheets sync losing OAuth-free public-CSV access** if the sheet's sharing setting ever changes | **Low** | Document the required sharing setting clearly in the ops runbook; fails loudly (cron script logs an error) rather than silently, same posture as today. |
| **Loss of TypeScript's compile-time query-shape checking** once `database.types.ts` no longer exists | **Medium** | Repository classes + PHPUnit tests are the replacement safety net; this is a process discipline risk, not a one-time technical risk — must be maintained continuously, not solved once. |
| **Behavioral drift during the line-by-line port** of `lib/money.ts`/`lib/mapping/*`/`lib/journal/*` (a typo introduces a rounding or off-by-one bug in accounting math) | **High** consequence, **Low** likelihood if done right | Port the unit tests *before or alongside* the implementation (test-first), reusing the exact same input/expected-output pairs as the 160 existing Node tests — a passing port against identical fixtures is strong evidence of behavioral parity. |

---

## 9. Estimated Affected Modules

Every module is affected, since every module currently depends on Supabase for both data access and authorization. Relative rewrite effort:

| Module | Effort | Why |
|---|---|---|
| Auth / session / RBAC | **Large** | Built from zero (Supabase Auth had no PHP equivalent to adapt) |
| Auto Journal & GL (Phase 5) | **Large** | Most PL/pgSQL functions/triggers of any module (workflow guards, balance checks, reversal atomicity, idempotency index) |
| Mapping Engine & Exception Center (Phase 4) | **Medium** | Mostly pure-function logic (reuses cleanly); RLS removal + UI port is the remaining work |
| Transaction Import (Phase 3) | **Medium** | Parsing library swap (`xlsx`→`PhpSpreadsheet` or CSV-only) + dedupe-key logic port; business rules reuse directly |
| Master Data (Entities/Outlets/Banks/COA/Investors/Contracts/Ownerships) (Phase 2) | **Medium** | Straightforward CRUD, but ownership effective-dating + total-ownership-≤100% guard needs careful re-implementation (currently a trigger) |
| General Ledger / Trial Balance | **Small-Medium** | Mostly read/aggregate queries against `v_posted_journal_lines` — the view ports directly, the RBAC scoping around it is the real work |
| Investor Portal | **Large** | The row-level scoping described in §7 is concentrated here — highest-consequence module if authorization is done wrong |
| Audit Trail | **Small** | Simple table + a helper function called from every mutation; mechanical port |
| Period Closing | **Medium** | `fn_guard_period_lock`/`fn_reopen_period` become PHP service methods; logic itself is simple, but touches almost every write path (journals, P&L) so must be threaded through consistently |
| P&L Engine (Phase 6, not yet built) | **Not started** | Explicitly deferred — this plan does not include it; it should be designed *directly* against the new PHP/MySQL architecture rather than ported from a Postgres version that never existed |
| Cashflow Management System (pre-existing module, not in your named list) | **Medium-Large** | Its own schema (6 migrations), RLS policies, Google Sheets sync (Node-specific), and 15 unit tests all need the same treatment as every other module — **flagging explicitly since it wasn't named in your module list**: confirm whether it is in scope for this migration or being retired/handled separately, since leaving it out changes the schema/effort estimate. |

---

## 10. Recommended Framework: Laravel vs. Native PHP + PDO

**Recommendation: structured native PHP + PDO, as the primary/default target — with Laravel as a deliberate upgrade path only if you can confirm two things about your specific cPanel account first.**

**Reasoning, weighed against your stated constraints:**

Your deployment steps explicitly end at "upload files → phpMyAdmin import → set config → open URL → login → works," with no SSH requirement and no assumption about what's pre-installed. Laravel's own requirements are modest (PHP 8.1+, a handful of standard extensions) and it does *not* strictly require SSH — you can run `composer install` locally and upload the resulting `vendor/` folder along with everything else. But two Laravel-specific frictions remain that a "standard shared hosting" account cannot be assumed to clear:

1. **Document root.** Laravel expects the web server's document root to be the `public/` subfolder, not the project root — because `public/index.php` is the only file meant to be web-accessible. Many cPanel accounts default a domain's document root to `public_html` directly. This is *solvable* (cPanel's "Domains" section usually lets you point a domain/subdomain's document root at a subfolder like `public_html/app/public`), but it is an extra manual step your deployment recipe doesn't currently have, and it varies by host — some budget shared-hosting providers restrict document-root changes to addon domains/subdomains only, not the primary domain.
2. **Composer availability is a build-time, not run-time, dependency** — you build the `vendor/` folder once (locally or in CI) and upload it, so the shared host itself never needs Composer installed. This removes the classic objection, *but* it means every future dependency bump requires that same local-build-then-reupload step, which is exactly the kind of friction "simple to deploy" is trying to avoid, and it's easy to forget and upload a stale `vendor/` folder.

**Structured native PHP + PDO has neither friction**: `public_html/index.php` is *already* the natural front controller wherever a domain's document root already points (no subfolder redirection needed), there is no `vendor/` folder to keep in sync, and the entire deploy is genuinely "upload the folder, it works" on literally any PHP 8.x + MySQL host, including the cheapest, most restrictive shared-hosting tier. Given that this system's authorization model already has to be built from scratch either way (RLS has no framework-level substitute in Laravel that saves the row-level-scoping work described in §7 — Laravel's Policies/Gates give you the *action*-level half for free, not the *row*-level half, which is the harder half here), Laravel's main draw — less boilerplate for auth/routing/validation — is worth less on this specific project than it would be on a simpler CRUD app.

**When to switch this recommendation to Laravel:** if you can confirm, on your actual cPanel plan, that (a) you can set a custom document root for the domain/subdomain this app will live on, and (b) you're comfortable with the build-locally-then-upload-`vendor/` workflow for every future dependency change — then Laravel is a perfectly reasonable choice and would meaningfully speed up the Controller/routing/validation boilerplate across ~18+ modules, and its migration system (`php artisan migrate`, runnable via a cPanel Cron Job trigger or a one-time SSH session if available) is more convenient than hand-run `schema.sql` for *future* schema changes (the initial import still happens via phpMyAdmin either way, per your deployment steps). This is a genuine, low-regret pivot point — the directory structure in §6 does not need to change either way, so the decision does not block starting the schema/service-layer work described in §§2-9.

**Either way, out of scope regardless of framework choice**: Eloquent's ActiveRecord pattern is not the right fit for the Repository-scoped-by-role discipline §7 depends on — even inside Laravel, this project should use Eloquent (if at all) as a thin data-mapper behind explicit Repository classes, never as `Model::where(...)->get()` called directly from a Controller, for the same reason raw Supabase queries without RLS would be dangerous: nothing forces the row-scoping to happen.

---

## Summary

- **Reuse directly**: all pure business logic (`lib/money.ts`, `lib/mapping/*`, `lib/journal/*`, `lib/import/*`), the schema's shape, the UI/workflow design, and — most importantly — every documented business rule and test scenario from Phases 1-5's validation reports. None of the accounting logic needs to be redesigned, only re-hosted.
- **Rewrite from scratch**: authorization (RLS → PHP Repository-scoped checks, the single biggest and highest-risk piece), all PL/pgSQL functions/triggers → PHP service-layer transactions, Supabase Auth → PHP sessions, all Server Actions → Controllers, the Google Sheets sync → a PHP CLI cron script.
- **Schema translation has 3-4 genuinely tricky spots** (filtered unique indexes, sequence-free journal numbering, CHECK-constraint version risk) — all identified above with a concrete, portable fix, not left as an open question.
- **Framework**: native PHP + PDO recommended as the default for guaranteed cPanel compatibility; Laravel is a reasonable pivot if you confirm document-root control and are comfortable with the Composer-build-then-upload workflow.

**No rewrite has started. Awaiting your review of this plan before any code changes.**
