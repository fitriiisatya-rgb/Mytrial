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
```

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
