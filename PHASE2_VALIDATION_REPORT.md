# Phase 2 Validation Report — Master Data UI

Builds directly on Phase 1 (PASS, see `PHASE1_VALIDATION_REPORT.md`). No Phase 1 schema, RLS, role model, or migration was redesigned — every module below reads/writes the existing tables through the existing RLS policies via the existing `lib/supabase/server.ts` client pattern.

## Pages Built

All under `/master-data`, gated by `middleware.ts` (`ROUTE_ROLES["/master-data"]` = super_admin/accounting/finance_manager/management) plus RLS as the real boundary:

| Module | List | Detail | Notes |
|---|---|---|---|
| Entitas | `entities/page.tsx` | `entities/[id]/page.tsx` | outlet count, bank count |
| Outlet | `outlets/page.tsx` | `outlets/[id]/page.tsx` | 4 tabs: Overview / Kontrak / Investor-Kepemilikan / Bank |
| Chart of Accounts | `coa/page.tsx` | — (tree is the detail) | hierarchical tree, flat search fallback |
| Rekening Bank | `banks/page.tsx` | `banks/[id]/page.tsx` | COA restricted to `account_type='asset'` |
| Investor | `investors/page.tsx` | `investors/[id]/page.tsx` | active vs. historical investments |
| Kontrak Kemitraan | `contracts/page.tsx` | `contracts/[id]/page.tsx` | ownership summary + badge |
| Kepemilikan Investor | `ownerships/page.tsx` | — (history is inline + on Outlet/Investor detail) | insert-only + "Akhiri" (end-date) action |

Each list page: search (`?q=`), filter (`?entity=`/`?status=`/`?outlet=`/`?investor=`, auto-submit on change), server-side pagination (`?page=`, 20/page, `{count:"exact"}` + `.range()` — never loads the full table), create/edit form, active/inactive toggle with a confirm prompt, and an empty-state row when RLS returns nothing.

## Components Built

`components/master-data/`: `data-table.tsx`, `page-header.tsx`, `status-badge.tsx` (`StatusBadge`, `ActiveBadge`, `OwnershipBadge`, `LoginStatusBadge`), `empty-state.tsx`, `form-field.tsx`, `confirm-submit-button.tsx` (client, wraps `window.confirm`), `search-filter-bar.tsx` (client, auto-submitting filters), `error-banner.tsx`, `pagination.tsx`. All presentational/generic — no per-module logic leaked into them.

## Server Actions Built

One `actions.ts` per module (all `"use server"`, all through the authenticated RLS-scoped client, none use a service-role client):
- `entities/actions.ts`: `saveEntity`, `toggleEntityActive`
- `outlets/actions.ts`: `saveOutlet`, `toggleOutletActive`
- `coa/actions.ts`: `saveCoa` (+ `wouldCreateCycle` guard), `toggleCoaActive`
- `banks/actions.ts`: `saveBank` (requires `coa_id`), `toggleBankActive`
- `investors/actions.ts`: `saveInvestor` (never sets `profile_id`), `toggleInvestorStatus`
- `contracts/actions.ts`: `saveContract`, `toggleContractActive`
- `ownerships/actions.ts`: `createOwnership` (insert-only), `endOwnership` (closes `end_date` + deactivates), `toggleOwnershipActive`

Plus shared helpers: `lib/supabase/audit.ts` (best-effort `audit_log` write), `lib/supabase/permissions.ts` (`canWrite()` — UX-only mirror of the RLS `staff_rw_*` policies, used to hide Create/Edit controls a role's RLS wouldn't let it use anyway), `lib/supabase/current-profile.ts` (from Phase 1).

## DB Interactions Validated

Same approach as Phase 1: a real PostgreSQL 16 engine (migrations applied from empty), `auth.uid()`/`auth.role()` emulated verbatim from Supabase's own implementation, roles impersonated via `SET LOCAL ROLE authenticated` + JWT-claim GUCs — never superuser/service_role. `supabase/tests/test_master_data.sql` now carries 14 assertions mapped directly to spec section 16:

1. **Create outlet success** — PASS
2. **Duplicate outlet code rejected** — PASS (`outlets_outlet_code_key` unique violation)
3. **Bank without COA rejected** — PASS (`coa_id` NOT NULL)
4. **Management unauthorized bank mutation rejected** — PASS (RLS: no `staff_rw_banks` policy match for `management`)
5. **Accounting/super_admin authorized behavior** — PASS (bank-with-COA, contract, outlet creation all succeed for both roles)
6. **Ownership ≤100% success** — PASS (60% + 40% = exactly 100%, both accepted)
7. **Ownership >100% rejected** — PASS (`fn_check_ownership_total`, added during Phase 1 validation)
8. **Historical ownership not overwritten** — PASS: inserted a closed 2025 row + a new 2027 row for the same outlet, then confirmed `fn_ownership_as_of(outlet, '2025-06-01')` still resolves to the 2025 investor, unaffected by the later row — the real DB-level consequence of `ownerships/actions.ts` being insert-only (never updates `ownership_pct`/`start_date`/`investor_id` on an existing row)
9. **Investor without profile_id can still be created** — PASS (`profile_id IS NULL` confirmed)
10. **Deactivation preserves historical relations** — PASS: deactivated an outlet with 2 `investor_ownerships` rows attached; both rows still present and joinable afterward (no cascade delete, no orphaning)

Plus (beyond the 10 required): audit-trail confirmation (accounting's `audit_log` write on outlet creation is real and visible to `super_admin`, even though accounting itself has no read policy on that table — see Issues below), and the exact embedded-relation `select()` shapes every page uses (`outlets(name)`, `banks(coa_id→coa)`, `partnership_contracts(outlets)`, etc.) against the live schema.

Re-ran Phase 1's `test_integrity.sql` (14/14) and `test_rls.sql` (23/23) against the same database afterward — zero regressions from the Phase 2 additions (no migrations were touched this phase).

## RLS Tests

Confirmed live, not just read from policy SQL:
- `accounting`: can create/edit outlets, banks (with COA), investors, contracts, ownerships; **cannot** publish a P&L directly (pre-existing Phase 1 guard, re-confirmed unaffected)
- `management`: can create/edit outlets (confirmed) but a direct `banks` INSERT is rejected by RLS (confirmed) — and the Master Data UI itself now hides the Create/Edit form and per-row Edit/Nonaktifkan controls on Rekening Bank, Kontrak Kemitraan, and Kepemilikan pages for `management`, showing a plain "peran Anda tidak memiliki izin…" notice instead, while still relying on RLS as the actual enforcement (`lib/supabase/permissions.ts`)
- `super_admin`: full access confirmed (bank creation succeeds)
- `investor`: unchanged from Phase 1 — no route into `/master-data` at all (middleware `ROUTE_ROLES` never lists `investor` for that prefix)

## Constraints Tests

All exercised live: `outlets_outlet_code_key` unique, `banks.coa_id NOT NULL`, `fn_check_ownership_total` (0002), `fn_ownership_as_of` point-in-time correctness, FK integrity after deactivation (no cascade/orphan).

## Build/Test Result

```
npm run typecheck   -> exit 0, zero errors
npm run lint        -> ✔ No ESLint warnings or errors
npm test            -> 18/18 pass (lib/money.ts, unchanged this phase)
npm run build       -> ✓ all 19 routes compiled (13 new master-data routes)
```

## Issues Found & Fixed

### Issue 1 — Tailwind can't see a template-literal class name
- **Root Cause**: `components/master-data/form-field.tsx`'s `span` prop was first written as `` className={`col-span-${span}`} ``. Tailwind's JIT scanner only detects literal class strings in source files — a runtime-interpolated template never generates the corresponding CSS, so every `span={2}`/`span={3}` field would have silently rendered as a single narrow column in production despite the class attribute looking correct in the DOM.
- **Fix**: Replaced with a static lookup map (`SPAN_CLASS = {1: "col-span-1", 2: "col-span-2", ...}`) so the literal strings are scanned correctly.
- **File Changed**: `components/master-data/form-field.tsx`
- **Retest Result**: Verified `grid-cols-*`/`col-span-*` utilities present in generated CSS via a successful `npm run build`.

### Issue 2 — TypeScript circular-inference error in the COA cycle-detection loop
- **Root Cause**: `wouldCreateCycle()`'s `while` loop reassigned the same loop variable (`current`) that was also passed as the argument to `.eq("id", current)` in the query producing that reassignment, which TS's control-flow narrowing couldn't resolve non-circularly (`'result' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer`).
- **Fix**: Introduced a separate `const cursor: string = current` read at the top of each iteration and used `cursor` (never `current`) inside the query.
- **File Changed**: `app/master-data/coa/actions.ts`
- **Retest Result**: `npm run typecheck` → 0 errors.

### Issue 3 (test-authoring bug, caught before merging) — ownership test 8 collided with test 6's fixture rows
- **Root Cause**: The first draft of test 8 ("historical ownership not overwritten") reused the same outlet as test 6, which by then already carried two active, open-ended (100%) ownership rows — any further active row for that outlet at any future date correctly triggers the total-ownership guard, for reasons unrelated to what test 8 was actually checking, producing a false FAIL.
- **Fix**: Test 8 now creates its own dedicated outlet/contract, isolating it from other tests' fixture state.
- **File Changed**: `supabase/tests/test_master_data.sql`
- **Retest Result**: PASS.

### Issue 4 (design note, not a bug) — `accounting` cannot read back its own `audit_log` writes
- **Root Cause**: Phase 1's `staff_read_audit` SELECT policy on `audit_log` only lists `super_admin`/`finance_manager`; `accounting` was only ever granted INSERT (via `staff_write_audit`, added during Phase 1 validation). This is consistent with Phase 1's design (accounting logs actions; audit *review* is a finance_manager/super_admin oversight function) and was not changed here, per "jangan redesign schema Phase 1." Confirmed live: an `accounting`-authored insert is real and immediately visible to `super_admin` in the same transaction, but a same-role read-back by `accounting` correctly returns 0 rows (RLS, not a failed write).
- **Action**: No code change — documented here so a future audit-log *viewer* UI (if built for `accounting`) isn't debugged as "writes are silently failing" when the real cause is the read policy scope.

## Remaining Risks

1. **No real Supabase Auth (GoTrue) / hosted project available in this sandbox** — same root cause as Phase 1 (Docker registry pulls blocked by the environment's egress policy). Every server action and query above was validated against a real PostgreSQL 16 engine with real authenticated-role impersonation (not superuser), which exercises the actual RLS/constraint/trigger behavior end-to-end — what is **not** yet validated is clicking through the actual rendered forms in a browser against a live session (cookie handling, client-side `useState`/error display, the `ConfirmSubmitButton`'s `window.confirm`). Recommend one manual pass once connected to a real Supabase project.
2. **`coa` parent-cycle prevention is application-level only** (`wouldCreateCycle()` in `coa/actions.ts`), not a DB constraint or trigger — a direct SQL `UPDATE` bypassing the app could still create a circular `parent_id` chain. Accepted for this phase per "jangan redesign schema Phase 1 yang sudah tervalidasi"; flagging in case a future migration wants a CHECK/trigger-level guard.
3. **Ownership list search (`?q=`) resolves against `investors`/`outlets` via two extra lookup queries** rather than a single indexed full-text query, since `investor_ownerships` itself has no free-text column. Fine at the stated target scale (500+ investors, 100+ outlets — two indexed `ilike` lookups, not a table scan of the ownership table itself), but would want a proper search index if scale grows an order of magnitude further.
4. **Investor login/invite flow is deliberately out of scope**, per spec — `profile_id` is never set from any Master Data form; the "Belum memiliki akun login" badge is informational only. This is Phase 3 (User Management) work.
5. **`npm audit`** still reports the same pre-existing `next@14.2.15` vulnerabilities noted in the Phase 1 report (unrelated to this phase's code, not re-litigated here).

## Phase 2 Gate

- [x] All 7 modules built: list + search + filter + server-side pagination + create + edit + active/inactive + empty state
- [x] Outlet & Investor detail pages (the two spec-flagged "critical" ones), plus Entity/Bank/Contract detail
- [x] Cross-navigation wired (Outlet ↔ Contract ↔ Investor, both directions)
- [x] RLS respected everywhere — no service-role client anywhere in Master Data code; UI also hides controls a role's RLS wouldn't honor anyway (banks/contracts/ownerships hidden from `management`)
- [x] Ownership effective-dating enforced at the UI/action level (insert-only + dedicated "Akhiri" action) on top of the Phase-1 DB guard
- [x] Audit trail wired for outlet/bank/investor/contract/ownership create/update/deactivate (best-effort, never blocks the primary mutation)
- [x] `typecheck`/`lint`/`test`/`build` all PASS
- [x] Database smoke tests: 14/14 new assertions PASS, 37/37 Phase 1 assertions still PASS (no regressions)

**FINAL STATUS: PASS**

Phase 2 Master Data PASS. Ready for Phase 3 Transaction Import.
