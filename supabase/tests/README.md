# Database integrity & RLS test suite

Validates every migration + RLS policy against a real PostgreSQL engine —
journal balance/immutability, period lock, dedupe, ownership effective-date
and total, distribution snapshot immutability, allocation reconciliation
(`test_integrity.sql`), and Row Level Security under real authenticated
Postgres roles for super_admin / accounting / finance_manager / two
investors each scoped to one outlet (`test_rls.sql`).

## Running against `supabase start` (real local Supabase — has `auth` schema already)

```bash
supabase db reset               # applies migrations/ + seed.sql
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/tests/010_rls_fixture.sql
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/tests/test_integrity.sql
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/tests/test_rls.sql
```

## Running against plain PostgreSQL (no Supabase CLI / Docker available)

`000_auth_emulation.sql` stands in for the `auth` schema Supabase's platform
normally provides (`auth.users`, `auth.uid()`, `auth.role()` — copied
verbatim from Supabase's real implementation, GUC-based) plus the
`anon`/`authenticated`/`service_role` roles. Only needed here; skip it
against a real Supabase project/local stack.

```bash
createdb partnership_finance_test
psql -d partnership_finance_test -f supabase/tests/000_auth_emulation.sql
for f in supabase/migrations/*.sql; do psql -d partnership_finance_test -f "$f"; done
psql -d partnership_finance_test -f supabase/seed.sql
psql -d partnership_finance_test -f supabase/tests/010_rls_fixture.sql
psql -d partnership_finance_test -f supabase/tests/test_integrity.sql
psql -d partnership_finance_test -f supabase/tests/test_rls.sql
psql -d partnership_finance_test -f supabase/tests/test_master_data.sql
psql -d partnership_finance_test -f supabase/tests/test_transaction_import.sql
```

`test_master_data.sql` (Phase 2) exercises the exact query/mutation shapes
used by `app/master-data/*/page.tsx` and `actions.ts` — the embedded-relation
selects (`outlets(name)`, `banks(coa_id → coa)`, etc.), create flows under
`accounting` and `management` roles, and the total-ownership guard firing
through the real insert shape the ownerships form submits. Everything it
inserts is rolled back at the end.

`test_transaction_import.sql` (Phase 3) exercises `import_batches`,
`bank_transactions_raw`, `revenue_transactions_raw`, `exceptions`,
`import_row_errors`, and `import_source_configs` — dedupe_key uniqueness
(duplicate-exact prevention and re-import idempotency), the Kredit>0
candidate-expense filter at the schema level, invalid date/money handling,
unknown-bank flagging via `exceptions`, source traceability joins, batch
summary accuracy, and RLS denial for `investor` and `management` (neither
role has any policy on any import table). The row-classification business
rules themselves (credit>0 candidate, debit-only ignored, date/money
normalization, bank/outlet matching, duplicate_exact vs duplicate_suspected,
idempotency across every row status) are unit-tested in
`lib/import/__tests__/*.test.ts` (part of `npm test`, 59 tests total) and
validated end-to-end against `supabase/tests/fixtures/buku_bank_synthetic.csv`
— see `PHASE3_VALIDATION_REPORT.md` for the actual statistics.

Every assertion prints exactly one `NOTICE:  PASS: <name>` or
`NOTICE:  FAIL: <name> - <reason>` line:

```bash
... -f supabase/tests/test_integrity.sql 2>&1 | grep -E 'PASS|FAIL'
```

A clean run has zero `FAIL` lines. `test_rls.sql` impersonates each role via
`SET LOCAL ROLE authenticated` + `request.jwt.claim.sub`/`request.jwt.claim.role`
— the same mechanism PostgREST uses in production — never `service_role`,
so every assertion reflects what RLS actually enforces for a real
authenticated request.
