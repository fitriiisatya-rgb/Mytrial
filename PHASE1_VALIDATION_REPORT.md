# Phase 1 Validation Report

## Environment

- Node.js v22.22.2, npm 10.9.7
- PostgreSQL 16.13 (native `apt` install), used as the validation target instead of `supabase start`
- Supabase CLI 1.226.4 (via `npx supabase`) — usable for `--version` and static commands, but `supabase start`/`db reset`/`gen types --db-url` all require pulling Docker images (`supabase/postgres-meta`, `supabase/gotrue`, …). Every image pull in this sandbox — via `docker pull` directly and via the Supabase CLI — was rejected by the environment's egress policy (`403 Forbidden` from Docker Hub's and AWS ECR Public's blob-storage CDNs). Per this environment's own operating instructions ("do not retry or route around a 403/407 policy denial — report it"), this was not routed around.
- **Workaround used instead**: a real, unmodified PostgreSQL 16 server, with a minimal `auth` schema (`auth.users`, `auth.uid()`, `auth.role()` — copied verbatim from Supabase's own implementation, GUC-based) standing in for the platform schema Supabase normally injects before your migrations run. This is not a mock of your schema or your RLS policies — every table, trigger, function, and policy below is your actual migration SQL, applied verbatim and unmodified logic-wise, running on a real Postgres engine. RLS was exercised via real `SET LOCAL ROLE authenticated` + `request.jwt.claim.sub`/`request.jwt.claim.role` — the exact mechanism PostgREST uses in production — never superuser or `service_role` bypass.
- `.env.local` created from `.env.example` (gitignored, not committed). **You must fill in real values** — see "Remaining Risks" below for the exact three variables.

## Commands Executed

```
npm install
npm run typecheck
npm run lint
npm test
npm run build
# Database (against native PostgreSQL 16, see Environment above):
createdb + psql -f supabase/tests/000_auth_emulation.sql
psql -f supabase/migrations/0001..0008_*.sql   (in order)
psql -f supabase/seed.sql
psql -f supabase/tests/010_rls_fixture.sql
psql -f supabase/tests/test_integrity.sql
psql -f supabase/tests/test_rls.sql
```

All of the above were actually executed in this environment (not statically reviewed) — see per-section results below. The two full-migration test databases were rebuilt from scratch (`DROP DATABASE` / `CREATE DATABASE`) three times over the course of fixing issues, confirming the migrations apply cleanly to an empty database every time, not just once.

## Migration Result

**PASS.** All 8 migrations + `seed.sql` apply cleanly, in order, to an empty PostgreSQL 16 database, with no manual SQL patching required afterward. Verified via `information_schema` and `pg_catalog` introspection after applying:

- 24 tables created, all expected columns/types/nullability present
- 13 enum types created with the exact expected labels
- All unique constraints present: `bank_transactions_raw.dedupe_key`, `revenue_transactions_raw.dedupe_key`, `journal_headers(source_type, source_id)`, `banks(bank_name, account_no)`, `accounting_periods(entity_id, period_year, period_month)`, `profit_distributions(outlet_id, accounting_period_id)`, `investor_profit_shares(profit_distribution_id, investor_id)`, `exceptions(source_table, source_id)`, `allocation_rule_outlets(allocation_rule_id, outlet_id)`
- All FKs, checks (`debit>=0 and credit>=0`, `not (debit>0 and credit>0)`, `ownership_pct between 0 and 100`, `end_date > start_date`, etc.), indexes, functions, triggers, the `v_posted_journal_lines` view, and all 26 RLS policies applied without error
- `seed.sql` inserts master data (1 entity, 25 COA, 5 outlets, 7 banks, 2 revenue sources, 4 investors, 5 contracts, 9 ownership rows, 1 accounting period) cleanly

## Build Result

**PASS.**

```
npm run typecheck   -> exit 0, zero errors
npm run lint        -> ✔ No ESLint warnings or errors
npm run build       -> ✓ Compiled successfully, all 8 routes built (5 dynamic, 2 static, 1 middleware)
```

## Test Result

**PASS — 18/18** (`lib/__tests__/money.test.ts`, `node --test`). The original 11 tests still pass unchanged; 7 new edge-case tests were added per spec section H: zero profit, negative profit (loss period), 100% ownership, invalid percentage input, zero/negative total weight, and very large Rupiah values (beyond the practical range this system needs, exercised end-to-end through `toSen`/`fromSen`/`allocateProportionally`).

## RLS Test Result

**PASS — 23/23 assertions**, run against real authenticated PostgreSQL roles (`supabase/tests/test_rls.sql`), not static policy review. Fixture: super_admin, accounting, finance_manager, and two investors each owning exactly one dedicated outlet (Outlet A / Outlet B), so cross-outlet leakage is unambiguous.

Confirmed passing (excerpt — full list in `supabase/tests/test_rls.sql`):
- Investor A: can read own profile, own ownership, own outlet's *published* P&L, own distribution
- Investor A: **cannot** read Outlet B's row, Outlet B's (still-draft) P&L, Investor B's ownership/distribution/share, any raw `journal_lines`, any raw `bank_transactions_raw`, any `coa_mapping_rules`, and a direct `UPDATE` on `coa` affects 0 rows
- Investor B: symmetric — cannot read Outlet A, cannot read its own outlet's report while it's still draft (published-only)
- Accounting: can read bank transactions, can create a mapping rule, **cannot** flip `pnl_reports.status` to `published` directly (must go through `fn_publish_pnl()`)
- Finance manager: can read `audit_log`, can call `fn_reopen_period()` (and the resulting audit row actually gets written — see Issue 3 below)
- Investor: blocked from calling `fn_reopen_period()` by its own role check
- `anon` (unauthenticated): 0 rows from `profiles`
- Super admin: full read access to `investors` (see Issue 4 below — this was initially broken)

## Financial Precision Result

**PASS.** `lib/money.ts` — 18/18 unit tests, all integer-sen/BigInt arithmetic, no float ever touches an accounting amount. Database-level reconciliation also verified live (not just in the JS layer): a Rp100-style remainder split, a shared-cost allocation over 5 outlets, and an investor-share split were all inserted into real `profit_distributions`/`investor_profit_shares`/`allocation_rule_outlets` rows and the stored `sum()` was asserted exactly equal to the source total (test 11, test 12 in `test_integrity.sql`) — the largest-remainder guarantee holds through the full app → DB path, not only inside the JS function.

## Issues Found

### Issue 1 — `@supabase/ssr@0.5.2` incompatible with resolved `@supabase/supabase-js@2.115.0`
- **Root Cause**: `package.json` pinned `@supabase/ssr@^0.5.2`, which was written against `@supabase/supabase-js@~2.45`. `npm install` correctly resolved the newest matching `^2.45.4`, which is `2.115.0` — a version that restructured its package's internal dist layout. `@supabase/ssr@0.5.2`'s type declarations import from a dist path that no longer exists in `2.115.0`, which silently collapsed every Supabase query's result type to `never` (not a build error — a wrong-type error that only shows up as `Property 'x' does not exist on type 'never'` at every call site).
- **Fix**: Upgraded `@supabase/ssr` to `^0.12.6`, the version whose peer dependency (`^2.114.0`) actually matches the resolved `supabase-js`. No application code changes needed — the deprecated `get`/`set`/`remove` cookie API the code already used is still supported in 0.12.6.
- **File Changed**: `package.json`, `package-lock.json`
- **Retest Result**: `npm run typecheck` → 0 errors (was 10 errors)

### Issue 2 — hand-written `types/database.types.ts` didn't structurally match postgrest-js's generic contract
- **Root Cause**: The Phase 1 scaffold's hand-written type stub (written and typechecked in a sandbox with no real `@supabase/supabase-js`, per its own header comment) was missing `Relationships` on every table/view and `CompositeTypes` at the schema level — both required by `@supabase/postgrest-js`'s `GenericTable`/`GenericSchema` contract. Without them, every `.from(table).select(...)` call's result type also resolved to `never`, and the one embedded-relation query (`investor_ownerships` → `outlets` in `app/investor/page.tsx`) additionally needed the actual foreign key declared to resolve.
- **Fix**: Added `Relationships: []` to all 24 tables + the view, `CompositeTypes: Record<string, never>` at the schema level, and the three real foreign keys on `investor_ownerships` (→ outlets, investors, partnership_contracts). Separately, cross-checked the entire hand-written schema against the live, migrated database via `information_schema.columns` and found `pnl_reports.{gross_profit,operating_profit,net_profit}` and `profit_distributions.distributable_profit` are `GENERATED ALWAYS AS ... STORED` columns, which Postgres reports as nullable — the hand-written type had them as non-null `Numeric`; corrected to `Numeric | null`.
- **File Changed**: `types/database.types.ts`
- **Retest Result**: `npm run typecheck` → 0 errors; `npm run build` → all 8 routes compile
- **Note**: this file is still hand-maintained. `npm run db:types` (real generation) needs either a linked hosted Supabase project or Docker registry access to `supabase/postgres-meta`, neither available in this sandbox — see Remaining Risks.

### Issue 3 (CRITICAL) — `audit_log` had no INSERT policy; every guarded function's audit trail silently failed under RLS
- **Root Cause**: Migration 0008 gave `audit_log` only a SELECT policy (`staff_read_audit`, super_admin/finance_manager). `fn_publish_pnl()` and `fn_reopen_period()` are plain functions (correctly *not* `SECURITY DEFINER`, since they should run as the calling user) that both `INSERT INTO audit_log` as their last step. With RLS enabled and zero INSERT policy on the table, **every** call to these functions — by any role, including super_admin — would successfully perform its guarded action but then fail on the audit-log insert, since Postgres RLS defaults to deny when no policy grants the operation. Caught live: `finance_manager_can_reopen_period` failed with `new row violates row-level security policy for table "audit_log"` when actually calling `fn_reopen_period()` as an authenticated `finance_manager`.
- **Fix**: Added `staff_write_audit` INSERT policy for `super_admin`/`accounting`/`finance_manager`.
- **File Changed**: `supabase/migrations/0008_rls.sql`
- **Retest Result**: `finance_manager_can_reopen_period` now PASSes; period status flips to `open` and the audit row is written.

### Issue 4 (CRITICAL) — `investors` table had no staff-facing RLS policy at all
- **Root Cause**: Migration 0008 gave every other master-data table (`entities`, `outlets`, `coa`, `banks`, `partnership_contracts`, …) a `staff_rw_*` policy, but `investors` only got `investor_read_own_row` (an investor reading their own linked row). Staff roles — including super_admin — had **zero** policies matching `investors`, so RLS denied all access by default. Caught live: `super_admin_full_access` returned 0 rows from `investors` when it should see all master data.
- **Fix**: Added `staff_rw_investors` policy (`super_admin`/`accounting`/`finance_manager`/`management`), matching the pattern used for every other master-data table.
- **File Changed**: `supabase/migrations/0008_rls.sql`
- **Retest Result**: `super_admin_full_access` now PASSes (6 investor rows visible: 4 seed + 2 test fixture).

### Issue 5 (CRITICAL) — posted-journal immutability had an unposting loophole
- **Root Cause**: `fn_block_posted_journal_edit()` only raised when `old.status = 'posted' AND new.status = 'posted'`. This blocks editing a field *while remaining* posted, but does **not** block flipping `status` away from `'posted'` first (e.g. back to `'draft'`) — after which the now-unblocked row could be freely edited, defeating Correction #2's "posted journals cannot be edited directly" guarantee entirely.
- **Fix**: Changed the guard to `if old.status = 'posted' then raise exception ...` — any UPDATE at all on an already-posted header is now rejected, full stop; the only sanctioned path is a new reversal journal referencing it via `reversal_of_id`.
- **File Changed**: `supabase/migrations/0005_journal_gl.sql`
- **Retest Result**: test `03b_posted_journal_unposting_blocked` (new) now PASSes; confirmed the old code would have let this through by testing against the pre-fix trigger first.

### Issue 6 — journal balance was never actually checked at the moment of promotion to approved/posted
- **Root Cause**: `fn_check_journal_balanced()` only fires `AFTER INSERT OR UPDATE ON journal_lines` — i.e. it re-validates balance only when lines themselves are touched *while the header is already* approved/posted. Nothing fired when the header's `status` column itself was updated from `draft`straight to `approved`/`posted` without touching `journal_lines` in the same statement, so an unbalanced journal could be promoted with zero errors.
- **Fix**: Added `fn_check_journal_balanced_on_promotion()` / `trg_guard_journal_balance_on_promotion`, a `BEFORE UPDATE ON journal_headers` trigger that checks `sum(debit) = sum(credit)` whenever `status` transitions into `approved` or `posted`.
- **File Changed**: `supabase/migrations/0005_journal_gl.sql`
- **Retest Result**: test `02_unbalanced_journal_rejected` (updated to actually attempt the promotion, not just insert unbalanced lines) now PASSes with the real error message.

### Issue 7 — no DB-level guard against total ownership exceeding 100% for an outlet
- **Root Cause**: `investor_ownerships.ownership_pct` was checked `between 0 and 100` per-row only; nothing prevented two overlapping-date ownership rows for the same outlet from summing past 100%, silently corrupting every downstream profit-distribution calculation. Spec item E.9 ("Total ownership validation bekerja") had no corresponding enforcement anywhere in the migrations.
- **Fix**: Added `fn_check_ownership_total()` / `trg_check_ownership_total`, a trigger mirroring the existing over-allocation guard pattern (0006), rejecting any INSERT/UPDATE where the sum of active, date-overlapping ownership rows for an outlet would exceed 100%.
- **File Changed**: `supabase/migrations/0002_master_data.sql`
- **Retest Result**: test `09_total_ownership_validation` (new) PASSes — inserting a 150%-overlapping row is rejected with a clear message.

### Issue 8 — three `SECURITY DEFINER` functions had no pinned `search_path`
- **Root Cause**: `auth_role()`, `auth_investor_id()`, `auth_accessible_outlets()` are `SECURITY DEFINER` (they must read `profiles`/`investors` under the definer's privilege, bypassing the caller's own RLS restrictions on those specific lookups) but had no `SET search_path`, the standard search-path-hijacking vector for `SECURITY DEFINER` functions (a malicious/unexpected object earlier in a caller-influenced `search_path` could shadow `profiles`, `investors`, etc.).
- **Fix**: Added `set search_path = public, pg_temp` to all three.
- **File Changed**: `supabase/migrations/0002_master_data.sql`
- **Retest Result**: All RLS tests (which depend on these three functions) still 23/23 PASS after the change; functions verified defined with `pg_proc.proconfig` containing `search_path=public, pg_temp` post-migration.

### Issue 9 — build failed prerendering `/login` without Supabase env vars
- **Root Cause**: `npm run build` prerenders `/login` (a client component using `createBrowserClient`) at build time; with no `.env.local`, `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` were `undefined`, and `@supabase/ssr` throws synchronously rather than deferring to runtime.
- **Fix**: Created `.env.local` from `.env.example` (gitignored, not committed — you must replace the placeholder values with your real project's before deploying; see Remaining Risks).
- **File Changed**: none tracked in git (`.env.local` only, already gitignored)
- **Retest Result**: `npm run build` → all 8 routes build, `/login` prerenders successfully

### Issue 10 (minor) — sandbox-only scaffolding left in the tree
- **Root Cause**: `lib/__tests__/node-shims.d.ts` was a hand-written ambient-type stand-in for `@types/node`, added because the original Phase 1 sandbox had no network access to install it. Its own header comment says to delete it "once `npm install` has been run in a real environment."
- **Fix**: Deleted (real `@types/node` from `npm install` supersedes it). Also added `.eslintrc.json` (`next/core-web-vitals`) since `next lint` had no config and would otherwise prompt interactively; added `*.tsbuildinfo` to `.gitignore`; committed `package-lock.json` for reproducible installs.
- **File Changed**: deleted `lib/__tests__/node-shims.d.ts`; added `.eslintrc.json`, `package-lock.json`; modified `.gitignore`
- **Retest Result**: `npm run lint` → ✔ No ESLint warnings or errors

## Remaining Risks

1. **`supabase db push` / `supabase start` / `npm run db:types` were not run against the actual Supabase CLI or a hosted project** — this sandbox's egress policy blocks every Docker registry (Docker Hub's CDN and AWS ECR Public both returned `403 Forbidden` to `docker pull` and to the Supabase CLI's internal image pulls). What *was* verified instead: the exact same migration SQL, unmodified, applying cleanly to a real PostgreSQL 16 engine three separate times from empty, plus RLS exercised under real authenticated Postgres roles (not superuser/service-role bypass) — this exercises the real engine-level behavior of every constraint, trigger, and policy. What is **not** yet verified: GoTrue's actual auth flow (signup/login/session refresh/JWT shape), Supabase Storage (unused in Phase 1), and the Supabase platform's own `supabase_realtime`/extension wiring. **Action for you**: run `supabase link --project-ref <ref> && supabase db push` (or `supabase start` locally if you have Docker) against a real dev/test project, then `npm run db:types` to replace the hand-patched `types/database.types.ts` with the authoritative generated version.
2. **Environment variables you must fill in yourself** (`.env.local`, not committed):
   - `NEXT_PUBLIC_SUPABASE_URL` — from your Supabase project's Settings → API
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same page
   - `SUPABASE_SERVICE_ROLE_KEY` — same page; server-only, already never referenced from client code (verified: no client component or `NEXT_PUBLIC_*` reference to it)
3. **The full GoTrue-based auth flow (login → middleware redirect → role home) has still only been verified by careful code reading against the standard Supabase SSR pattern, not by an actual browser session against a real Supabase Auth server** — the local Postgres validation used direct role/GUC impersonation, which is the correct way to test RLS itself but does not exercise GoTrue's session/cookie handling. Recommend one manual smoke test (create a user in Supabase Dashboard → Authentication, insert a matching `profiles` row with `role='super_admin'`, log in) once connected to a real project.
4. **`npm audit` reports 7 vulnerabilities (6 high, 1 critical)** in `next@14.2.15` and its transitive `postcss`/`tar`, all requiring a Next.js 14→16 major-version bump to fully resolve (`npm audit fix --force`). Not applied here — a major framework upgrade is a bigger decision than a Phase 1 stabilization pass should make unilaterally; flagging for you to schedule deliberately rather than bundling into this validation.
5. **Two intentionally-scoped-out Phase 1 items** (per `PHASE1_README.md`, unchanged by this pass): Supabase Storage / file uploads, and any server actions beyond the auth/middleware scaffold (none exist yet to validate authorization on — noted as a gate item for whichever phase adds them).

## Phase 1 Gate

- [x] `npm install` berhasil
- [x] `tsc`/typecheck PASS (0 errors, was 10)
- [x] lint PASS (0 warnings/errors)
- [x] tests PASS (18/18, was 11/11)
- [x] `next build` PASS (all 8 routes)
- [x] migrations berhasil ke real PostgreSQL (verified 3x from empty; `supabase db push` against a real/linked project still pending — see Remaining Risks #1)
- [x] generated DB types berhasil (hand-patched + cross-verified against live schema; authoritative `npm run db:types` pending real project — see Remaining Risks #1)
- [x] seed berhasil
- [x] RLS authenticated tests PASS (23/23, real authenticated Postgres roles)
- [x] journal balance tests PASS (including two real bugs found and fixed)
- [x] duplicate/idempotency tests PASS
- [x] money precision tests PASS (18/18, DB-level reconciliation also verified)

**FINAL STATUS: PASS**

Ten issues were found and fixed during this pass — five of them (audit-log INSERT policy, missing `investors` RLS policy, the posted-journal unposting loophole, the missing balance-check-on-promotion, and the missing total-ownership guard) were genuine correctness/security gaps in the migrations themselves, not environment friction, caught specifically because RLS and integrity constraints were exercised against a real running Postgres engine rather than reviewed statically. Every fix was re-validated by re-running the full migration set from an empty database and re-running the full test suite, with zero regressions. The one gate item not fully closed is running against the actual Supabase CLI/hosted platform (blocked by this sandbox's Docker registry policy, not by anything in your code) — everything CLI-independent about the migrations, RLS, and application code is validated and green.
