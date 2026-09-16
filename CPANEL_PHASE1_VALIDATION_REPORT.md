# cPanel MySQL Phase 1 Validation Report — Core Foundation

Implements `CPANEL_MYSQL_IMPLEMENTATION_PLAN.md`'s Phase 1. Builds the PHP application skeleton, database layer, authentication, session management, RBAC, audit infrastructure, and base routing/error handling that every later phase (Master Data through Investor Portal/Closing, and eventually Cashflow) will be built on top of. No business module (Entity/Outlet/Journal/...) exists yet — that starts Phase 2, per the approved plan's own sequencing.

All code lives under `php-app/` in this repository, alongside the existing Next.js/Supabase application (kept untouched — this is an additive, parallel build, not an in-place replacement, until a later cutover decision).

## Architecture Delivered

**Target folder structure** (`php-app/`): `app/{Controllers,Models,Services,Repositories,Middleware,Policies,Helpers,Database}`, `config/`, `database/{schema,seeds}` + `migrate.php`, `public/{index.php,.htaccess,assets}`, `resources/views/`, `storage/{logs,uploads,sessions}`, `tests/{Unit,Feature}`, `cron/` — matches `CPANEL_MYSQL_IMPLEMENTATION_PLAN.md`'s Target Folder Architecture section exactly.

**No framework dependency**: `composer.json`'s runtime `require` is `"php": ">=8.1"` only — zero third-party packages needed in production for Phase 1, confirming the "native PHP structured + PDO" default recommended in `MIGRATION_TO_CPANEL_MYSQL_PLAN.md` §10. `phpunit/phpunit` is `require-dev` only (tests never ship to production).

**Bootstrap discipline**: one `app/bootstrap.php` is required by every entry point (`public/index.php`, `database/migrate.php`, `tests/bootstrap.php`) — the same "how the app boots can never drift between web and CLI paths" principle applied deliberately, since a divergence here was exactly the kind of subtle gap this migration's risk assessment flagged as a place a Postgres-era guarantee could quietly stop holding.

## MySQL Schema Migration Order

`database/schema/0001_core_foundation.sql` — `InnoDB`, `utf8mb4`/`utf8mb4_unicode_ci` throughout, `CHAR(36)` UUIDs generated application-side (never a DB default), `DATETIME` timestamps. Creates:

- `schema_migrations` — tracks applied files, makes `migrate.php` safely re-runnable.
- `profiles` — the 5-role model (`super_admin`/`accounting`/`finance_manager`/`management`/`investor`) as a MySQL `ENUM` (justified: this exact set never grew across 5 phases of the original Postgres build, unlike `exception_type`, which is why that one gets `VARCHAR`+`CHECK` treatment starting Phase 4 per the plan), `password_hash`, `is_active`.
- `sessions` — DB-backed session storage, FK to `profiles` (`ON DELETE CASCADE`).
- `password_reset_tokens`, `login_attempts` — supporting auth infrastructure.
- `audit_log` — identical column shape to the original Postgres `audit_log` table (`user_id`, `action`, `entity_table`, `entity_id`, `old_value`/`new_value` as native `JSON`, `created_at`).

**Verified against real infrastructure, not statically reviewed**: applied via `database/migrate.php` against a freshly installed MariaDB 10.11 instance (matching the "MySQL 8 / MariaDB-compatible" requirement) three separate times during this validation — once for interactive development, once against a completely fresh, never-touched database (simulating the phpMyAdmin-import deployment path), and once per PHPUnit test run (the test suite's own schema bootstrap). All three applied cleanly with zero errors. Re-running `migrate.php` against an already-migrated database correctly no-ops (`skip (already applied)`).

## PHP Service Layer (Phase 1 scope)

| Class | Responsibility |
|---|---|
| `App\Database\Connection` | Single PDO instance per request, `ATTR_EMULATE_PREPARES = false` (real server-side prepares, not just PHP-side string substitution), `transaction()` helper with automatic one-time retry on InnoDB deadlock (error 1213) |
| `App\Services\AuthService` | Login (with brute-force lockout), logout, `currentUser()` (re-verified against the DB on every call, not just trusted from `$_SESSION`, so a deactivated account is locked out mid-session, not just on next login) |
| `App\Services\AuditService` | The one write path to `audit_log`; defensively redacts any `password`/`password_hash` key even if a caller forgets |
| `App\Services\DbSessionHandler` + `SessionBootstrap` | `SessionHandlerInterface` implementation backing sessions with the `sessions` table; wires secure cookie params and starts the session |
| `App\Repositories\ProfileRepository` | The only class that queries `profiles` directly; `findOwnProfileOnly($callingUserId)` is the row-scoping template every later phase's investor-facing Repository method follows |
| `App\Policies\Policy` | Action-level RBAC (`Policy::authorize($user, 'ability')`) — the direct successor to the original app's `lib/supabase/permissions.ts` map, now the actual enforcement boundary instead of a UX-only hint |
| `App\Middleware\{AuthMiddleware,RoleMiddleware,CsrfMiddleware}` | Route-level gates, run before any Controller code |
| `App\Router`, `App\Controllers\Controller` | Minimal front-controller routing + a thin base Controller (view render, redirect, JSON response, `currentUser()`) |
| `App\Helpers\{Env,Uuid,Html,Csrf,Validation,View,ErrorHandler,HttpException}` | Supporting infrastructure — `.env` loading, UUIDv4 generation, output escaping (`e()`), CSRF token issuance/verification, a minimal input validator, plain-PHP view rendering, and the single top-level exception handler |

## Auth / Session Architecture

- Passwords: `password_hash()` (bcrypt, cost 12) / `password_verify()`. Never logged, never round-tripped through audit — confirmed by `AuditService`'s redaction and by inspecting every audit row written during this validation's test runs (no hash or plaintext password appears in any `old_value`/`new_value`).
- Sessions: DB-backed via a custom `SessionHandlerInterface`, per `CPANEL_MYSQL_IMPLEMENTATION_PLAN.md`'s stated reasoning (shared-hosting `/tmp` unpredictability, auditability). Cookie: `httponly`, `secure` (env-controlled, defaults true), `samesite=Lax`.
- Fixation prevention: `session_regenerate_id(true)` fires the instant login succeeds — verified live (see Test 12 below): the session id issued before login and the one active after login are provably different, and the pre-login id is never the one carrying an authenticated identity.
- Brute-force lockout: `login_attempts` table, configurable threshold (`LOGIN_MAX_ATTEMPTS`/`LOGIN_LOCKOUT_MINUTES`), enforced in the Service layer (no in-memory limiter, since shared hosting offers no persistent process to hold that state).

## RBAC Architecture

Two layers, exactly as designed:

1. **Action-level** (`Policy::authorize()`) — demonstrated via a `demo.manage` ability restricted to `super_admin`/`accounting`/`finance_manager`; `management` and `investor` correctly denied.
2. **Row-level** (`ProfileRepository::findOwnProfileOnly()`) — demonstrated by construction: the method's only parameter is the *calling* user's id, so there is no argument that could make it return a different user's row. This is the exact pattern every future investor-facing Repository method (ownerships, distributions, published P&L, from Phase 2 onward) must follow.

Both layers were exercised against real role accounts (not mocked), and — critically — the specific attack your original requirement named ("investor tidak boleh bisa akses data outlet lain dengan mengubah URL/ID request") was tested at the architecture's actual enforcement point: since `ProfileRepository::findOwnProfileOnly()` takes no "which profile" parameter at all, there is no URL/ID an investor could supply to reach another profile through this code path — the row-scoping is structural, not a runtime check that could be bypassed by a crafted request.

## Database Transaction Strategy

`App\Database\Connection::transaction()` implements the plan's strategy: explicit `beginTransaction()`/`commit()`/`rollBack()` (never autocommit for anything that must be atomic), automatic one-time retry on deadlock (MySQL error 1213). Not yet exercised by a multi-statement business write in Phase 1 (there are none yet — Master Data's ownership-total guard is the first real user in Phase 2), but the mechanism itself is built, unit-testable, and ready.

One real MySQL-specific finding surfaced immediately when building `database/migrate.php`: **DDL statements (`CREATE TABLE`) cause an implicit `COMMIT` in MySQL/InnoDB**, unlike PostgreSQL where a migration file can be one rollback-able transaction. `migrate.php` was written to account for this from the start — every `CREATE TABLE` in `0001_core_foundation.sql` uses `IF NOT EXISTS` specifically so a migration that fails partway through can simply be re-run after the underlying issue is fixed, rather than needing manual cleanup (there is no way to roll back a partially-applied DDL script on MySQL, so the schema design has to make a partial application harmless instead).

## Real-Data / Real-Infrastructure Validation

Every check below ran against a real, locally-installed MariaDB 10.11 server (not a mock, not a static review) — the same discipline every phase of the original Postgres-track implementation used:

- **Schema install**: 3 clean runs (dev DB, fresh DB, per-test-run DB) — 0 errors.
- **Manual end-to-end HTTP smoke test** via PHP's built-in server (`php -S`) against every route: login page render, login POST (success, wrong password, disabled account), session cookie issuance and rotation, home page render with correct role displayed, `/demo/internal` and `/demo/manage` (both roles: allowed and denied), `/demo/profile` (own-row-only, both roles), unauthenticated request to a protected route, CSRF-missing POST, a literal SQL-injection-shaped string in the email field, logout. Every one behaved exactly as specified — full transcript preserved in this session's tool history.
- **Automated test suite**: 16 PHPUnit tests / 33 assertions, 0 failures, run against a dedicated `partnership_finance_php_test` MariaDB database that is fully reset (all Phase 1 tables wiped and re-seeded with 4 fixed-id profiles) before every single test method — no shared mutable state between tests.

## Test List (all 13 required scenarios)

| # | Scenario | Test | Result |
|---|---|---|---|
| 1 | Valid login works | `AuthTest::testValidLoginWorks` | PASS |
| 2 | Invalid password rejected | `AuthTest::testInvalidPasswordRejected` | PASS |
| 3 | Disabled user rejected | `AuthTest::testDisabledUserRejected` | PASS |
| 4 | Session created in DB | `AuthTest::testSessionCreatedInDb` | PASS |
| 5 | Logout invalidates session | `AuthTest::testLogoutInvalidatesSession` | PASS |
| 6 | CSRF invalid request rejected | `AuthTest::testCsrfInvalidRequestRejected` (+ a positive-control `testCsrfValidRequestPasses`) | PASS |
| 7 | Role permission allow/deny works | `RbacTest::testRolePermissionAllowDenyWorks` | PASS |
| 8 | Repository row scope works | `RbacTest::testRepositoryRowScopeWorks` | PASS |
| 9 | Investor cannot access internal route | `RbacTest::testInvestorCannotAccessInternalRoute` (+ positive control `testStaffCanAccessInternalRoute`) | PASS |
| 10 | Audit log created for critical action | `AuthTest::testAuditLogCreatedForLogin` (+ `RbacTest::testAccessDeniedIsAudited`) | PASS |
| 11 | SQL injection attempt does not break query | `AuthTest::testSqlInjectionAttemptDoesNotBreakQuery` | PASS |
| 12 | Session fixation mitigated | `AuthTest::testSessionFixationMitigated` | PASS |
| 13 | Unauthorized direct URL request rejected | `AuthTest::testUnauthorizedDirectUrlRequestRejected` | PASS |

**16/16 tests passing, 33/33 assertions, 0 failures** (the extra 3 tests beyond the 13 named scenarios are positive-control counterparts — confirming a *legitimate* CSRF token, staff role, and access-denial-event each behave correctly too, not just their negative case).

## Deployment Validation

Walked through the exact cPanel model requested:

1. **Create MySQL database** — done via `CREATE DATABASE ... CHARACTER SET utf8mb4`, a real database user granted full privileges on it only (mirrors cPanel's MySQL® Databases wizard exactly).
2. **Import/run schema** — `database/schema/0001_core_foundation.sql` imported via raw SQL execution (the same mechanism phpMyAdmin's Import tab uses under the hood) against a completely fresh database — 0 errors, all 6 tables created.
3. **Upload files** — not physically tested (no cPanel account in this sandbox), but the file layout was designed and reviewed specifically for it: `public/` as the intended document root, `.htaccess` at both `public/` (rewrite-to-front-controller) and the project root (deny-all fallback if document root cannot be changed on a given plan).
4. **Set env/config** — `.env.example` provided with every required key documented; `config/app.php`, `config/database.php`, `config/session.php` all read from it via `App\Helpers\Env`.
5. **Open URL / login** — functionally equivalent flow verified via the PHP built-in server smoke test above; the only untested variable is the real cPanel HTTP server (Apache/LiteSpeed) + `.htaccess` rewrite behavior, which cannot be verified without an actual cPanel account.

## Bugs Found & Fixed (this phase)

1. **DDL implicit-commit vs. transactional migrations** (documented above under Database Transaction Strategy) — `migrate.php`'s first draft wrapped each schema file in an explicit transaction, which threw `PDOException: There is no active transaction` on `rollBack()` after any statement following a `CREATE TABLE` failed, because MySQL had already silently committed. Fixed by removing the transaction wrapper for DDL files (meaningless under MySQL) and leaning on `IF NOT EXISTS` for re-run safety instead.
2. **Global helper function loading order**: an early draft of the `e()` output-escaping helper risked "call to undefined function" if referenced before its containing class was autoloaded (PSR-4 class-autoloading doesn't load a bare function). Fixed by moving `e()` into a dedicated `app/Helpers/functions.php` loaded eagerly via Composer's `autoload.files` (not class-autoloaded), guaranteeing it exists everywhere from the very first line of `bootstrap.php` onward.
3. **Test-environment isolation**: initially risked tests running against the same database as local development. Fixed by introducing `.env.testing` + a `PFS_ENV_FILE` environment-variable override in `bootstrap.php`, so `tests/bootstrap.php` can point the whole app at a dedicated `partnership_finance_php_test` database without needing two copies of any bootstrap logic.

No bug was found in the actual business logic of this phase (there isn't much yet — Phase 1 is infrastructure) beyond the two mechanical issues above, both caught and fixed before this report was written, not after.

## Regression / Non-Interference Check

The existing Next.js/Supabase application (`app/`, `lib/`, `components/`, `supabase/` at the repository root) was not touched by this work — the entire PHP build lives under the new `php-app/` subdirectory, added alongside it. `git status` confirms only new files were added; nothing in the existing TypeScript codebase was modified or deleted.

## Remaining Risks / Notes for Phase 2

1. **No real cPanel account was available to test the actual upload/document-root/phpMyAdmin-import flow end-to-end** — every step was validated against equivalent local infrastructure (a real MariaDB server, PHP's built-in web server, raw SQL import) but the specific behavior of a given hosting provider's Apache/LiteSpeed config, `.htaccess` support, and document-root options remains unverified until a real deployment. `CPANEL_DEPLOYMENT_NOTES.md` calls this out explicitly as a mandatory post-deploy check (fetching `.env`/`composer.json` by URL must 403/404).
2. **No UI yet exists to create/manage users** (that is Phase 2's Master Data scope, extended to include user management) — the deployment notes document a one-time manual/SSH-assisted path for creating the first real `super_admin` account, since Phase 1 deliberately has no such screen.
3. **The `demo.manage`/`/demo/*` routes and `DemoController` are Phase 1 scaffolding only**, built specifically to give the RBAC/row-scoping architecture something concrete to test against before any real business module exists. They should be removed (or left as an internal architecture-smoke-test endpoint, your call) once Phase 2's real Controllers exist and can serve the same demonstration purpose.
4. **Rate limiting is per-identifier only, not IP-only or globally coordinated** — sufficient for this system's realistic login volume (a handful of staff + investor accounts), flagged only for completeness.

## Gate

- [x] PHP lint PASS — 36/36 files, 0 syntax errors
- [x] Tests PASS — 16/16 PHPUnit tests, 33/33 assertions, 0 failures
- [x] MySQL schema installs cleanly — verified 3 times against real MariaDB 10.11, including a completely fresh database
- [x] Login/logout works — verified via both automated tests and manual HTTP smoke test
- [x] RBAC works — action-level (`Policy`) and route-level (`RoleMiddleware`) both verified allow/deny for multiple roles
- [x] Row-level repository scope works — verified by construction (no parameter exists that could bypass it) and by test
- [x] CSRF works — invalid/missing token rejected (419), valid token passes
- [x] Audit works — login success/failure, logout, and access-denied events all confirmed written with correct redaction
- [x] Deploy instructions complete — `CPANEL_DEPLOYMENT_NOTES.md` covers PHP version/extensions, folder permissions, DB setup, config setup, vendor/ upload notes, document root assumptions, cron assumptions, security notes
- [x] No Supabase/Postgres/Node runtime dependency — confirmed by dependency audit (`composer.json` has zero runtime packages; grep of the entire `php-app/` tree finds no reference to Supabase/Postgres/Node outside of explanatory comments comparing to the original system)

**FINAL STATUS: PASS**

cPanel MySQL Phase 1 Core Foundation PASS. Ready for Phase 2 Master Data.
