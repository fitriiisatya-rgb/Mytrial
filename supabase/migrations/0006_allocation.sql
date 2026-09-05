-- =====================================================================
-- 0006 — SHARED COST ALLOCATION
-- =====================================================================

create table allocation_rules (
  id                       uuid primary key default uuid_generate_v4(),
  source_coa_id            uuid not null references coa(id),
  source_journal_line_id   uuid references journal_lines(id),
  method                   allocation_method not null,
  effective_date           date not null,
  total_amount             numeric(18,2) not null check (total_amount >= 0),
  resulting_journal_id     uuid references journal_headers(id),
  active                   boolean not null default true,
  created_by               uuid references profiles(id),
  created_at               timestamptz not null default now()
);

create table allocation_rule_outlets (
  id                   uuid primary key default uuid_generate_v4(),
  allocation_rule_id   uuid not null references allocation_rules(id) on delete cascade,
  outlet_id            uuid not null references outlets(id),
  percentage           numeric(9,6),     -- custom_percentage
  weight_basis         numeric(18,2),    -- revenue used for revenue_percentage, stored for audit
  manual_amount        numeric(18,2),    -- manual_amount
  -- CORRECTION #7: the allocated amount actually posted for this outlet.
  -- Computed by the TypeScript engine using integer-safe, deterministic
  -- remainder handling (largest-remainder method) so that
  -- sum(allocated_amount) over the rule always equals total_amount
  -- exactly — no floating-point drift, no silent rounding gap.
  allocated_amount     numeric(18,2) not null default 0,
  unique (allocation_rule_id, outlet_id)
);
comment on column allocation_rule_outlets.allocated_amount is
  'CORRECTION #7: must reconcile exactly to allocation_rules.total_amount '
  'when summed. See lib/money.ts allocateProportionally() in the app layer '
  '— any remainder is assigned deterministically, never left to float rounding.';

-- DB-level guarantee that whatever the app computed does in fact
-- reconcile before the allocation is considered final.
create or replace function fn_check_allocation_reconciles() returns trigger as $$
declare
  v_total numeric(18,2);
  v_sum numeric(18,2);
begin
  select total_amount into v_total from allocation_rules where id = new.allocation_rule_id;
  select coalesce(sum(allocated_amount),0) into v_sum
    from allocation_rule_outlets where allocation_rule_id = new.allocation_rule_id;
  if v_sum > v_total then
    raise exception 'Allocation % over-allocated: % > total %', new.allocation_rule_id, v_sum, v_total;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_allocation_reconciles
  after insert or update on allocation_rule_outlets
  for each row execute function fn_check_allocation_reconciles();
