# Phase 1 — Foundation

Status: **schema + migrations + RLS + auth scaffold selesai.** Business flow tidak diubah dari `schema.sql`/`prototype.html` yang sudah kamu setujui — file di sini hanya memperketat 7 poin koreksi + bank reconciliation.

## Struktur

```
supabase/
  migrations/
    0001_extensions_enums.sql       enum & extension dasar
    0002_master_data.sql            profiles, entities, coa, outlets, banks,
                                     investors, contracts, ownerships, periods,
                                     audit_log, auth helper functions
    0003_import_sources.sql         import_batches, revenue_sources (#3),
                                     bank/revenue raw txn + dedupe_key (#6)
    0004_mapping_exceptions.sql     outlet/COA mapping rules, exceptions
    0005_journal_gl.sql             journal headers/lines, bank_account_id,
                                     workflow guard (#2), period lock (#5)
    0006_allocation.sql             shared cost allocation + reconciliation guard
    0007_pnl_distribution.sql       P&L, fn_period_readiness/fn_publish_pnl (#5),
                                     fn_reopen_period, profit distribution with
                                     immutability trigger (#4)
    0008_rls.sql                    Row Level Security — all roles
  seed.sql                          master data only (Phase 1 scope)
app/                                Next.js App Router — auth flow + 5 role homes
lib/supabase/{client,server,middleware}.ts   official SSR client pattern
lib/money.ts                        deterministic Rupiah arithmetic (#7)
lib/__tests__/money.test.ts         real tests for lib/money.ts
types/database.types.ts             hand-written — regenerate once connected
middleware.ts                       session refresh + role-based route guard
```

## Correction-by-correction: where it lives

| # | Correction | Where |
|---|---|---|
| 1 | Bank-specific COA | `banks.coa_id` is `not null` (0002). Every seeded bank has a distinct COA (`seed.sql`). Engine code in Phase 5 must credit `bank.coa_id`, never a shared account. |
| 2 | Journal workflow | `journal_status` enum + `trg_guard_period_lock` + `trg_block_posted_edit` (0005). Canonical read path is the view `v_posted_journal_lines` — GL/P&L code in later phases must query this view, never `journal_lines` directly. |
| 3 | Configurable revenue source | `revenue_sources.clearing_coa_id` (0003). Two seeded sources (`POS_CASH`, `QRIS_PENDING`) with different clearing accounts, proving it isn't hardcoded to one bank. |
| 4 | Historical ownership snapshot | `fn_ownership_as_of(outlet_id, as_of_date)` (0002) — point-in-time lookup, not `active=true`. `profit_distributions`/`investor_profit_shares` store `*_snapshot` columns and are locked by trigger once `approved`/`paid` (0007). |
| 5 | Period closing & publishing guard | `fn_period_readiness()` computes the real checklist; `fn_publish_pnl()` is the only path to `status='published'` (enforced by `trg_guard_pnl_publish`); `fn_reopen_period()` is the only path out of `closed`/`published`, role-checked and audited (0007). `trg_guard_period_lock` blocks journals into a closed period (0005). |
| 6 | Robust dedupe/idempotency | `dedupe_key` generated column (`coalesce(external_ref, fingerprint)`) with a unique constraint, on both raw transaction tables (0003). `uq_journal_source` on `journal_headers(source_type, source_id)` makes journal generation idempotent at the DB level (0005). |
| 7 | Financial precision | DB: `numeric(18,2)` everywhere (was already correct). App layer: `lib/money.ts` does all arithmetic in integer sen via `BigInt`, with `allocateProportionally()` using the largest-remainder method so splits always reconcile exactly. |
| — | Bank reconciliation | `journal_lines.bank_account_id` (0005) — every bank-side line points directly at a `banks` row, no join-through-COA required. |

## What is genuinely verified vs what still needs a real environment

This sandbox has **no network access at all** (confirmed: `npm`/`apt` registries return `403 host_not_allowed`) and no local PostgreSQL or Supabase CLI. Being precise about what that means:

**Actually run and passing, in this sandbox:**
- `lib/money.ts` — typechecked with the real TypeScript compiler (`tsc`, exit 0) and unit-tested with Node's built-in test runner: **11/11 tests pass**, including the float-precision trap (`0.1+0.2`), the classic 100/3 remainder case, and an end-to-end reconciliation replaying the Ciparigi profit-share numbers from the approved prototype.
- The full `app/`, `lib/`, `types/`, `middleware.ts` scaffold — typechecked against hand-written ambient stubs standing in for `next`/`react`/`@supabase/ssr` (since those packages can't be installed here). This catches syntax errors, typos, and internal type mismatches in *my* code, but **cannot** catch a mismatch against the real library APIs. Result: clean after two rounds of fixes (implicit-`any` params, a stale `@ts-expect-error`, incomplete stub coverage).
- The SQL migrations — static-checked (balanced parentheses, balanced `$$` dollar-quoting, no forward-references between tables across files). **Not** run against a real Postgres engine.

**Needs your real repo / Claude Code to verify:**
- `supabase db reset` actually applying all 8 migrations + seed cleanly against Postgres.
- `npm install && npm run build` — real Next.js compilation against real `@supabase/ssr` types (my hand-written `database.types.ts` needs replacing with `npm run db:types` output the moment you're connected).
- `npm run lint` (ESLint isn't installed in this sandbox).
- RLS policies actually denying what they should — tested here only by code review, not by an authenticated request hitting Postgres.
- The auth flow end-to-end (login → middleware redirect → role home) — code is written to the standard Supabase SSR pattern, but "the standard pattern, reviewed carefully" is not the same claim as "I watched it work."

## Menjalankan di repo asli

```bash
npm install
cp .env.example .env.local   # isi dengan project Supabase kamu
supabase link --project-ref <ref>
supabase db push             # atau: supabase db reset (lokal, termasuk seed.sql)
npm run db:types             # timpa types/database.types.ts dengan hasil generate asli
npm run dev
```

Buat user pertama lewat Supabase Dashboard → Authentication, lalu insert baris `profiles` dengan role `super_admin` supaya bisa login dan diarahkan ke `/admin`.

## Lanjut ke Phase 2

Phase 2 (UI Master Data: Entity/Outlet/Bank/COA/Investor/Contract/Ownership) baru masuk akal dikerjakan setelah kamu konfirmasi migrations ini benar-benar apply bersih di project Supabase asli — kalau ada error saat `supabase db push`, itu jauh lebih murah diperbaiki sekarang daripada setelah Phase 2-5 dibangun di atasnya.
