-- =====================================================================
-- 0004 — MAPPING ENGINE & EXCEPTION CENTER
-- (business rules unchanged from the approved prototype — priority-
-- ordered rules, learning mapping on resolve)
-- =====================================================================

create table outlet_mapping_rules (
  id               uuid primary key default uuid_generate_v4(),
  bank_id          uuid references banks(id),          -- null = any bank
  unit_value       text,
  classification   text,
  match_type       match_type not null default 'keyword',
  match_value      text,
  direction        text default 'out',
  output_outlet_id uuid not null references outlets(id),
  priority         integer not null default 100,        -- lower = higher priority
  active           boolean not null default true,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now()
);
create index idx_outlet_rule_priority on outlet_mapping_rules (priority) where active;

create table coa_mapping_rules (
  id                    uuid primary key default uuid_generate_v4(),
  bank_id               uuid references banks(id),
  outlet_id             uuid references outlets(id),        -- null = any outlet
  unit_value            text,
  classification        text,
  description_keyword   text,
  direction             text default 'out',
  amount_min            numeric(18,2),
  amount_max            numeric(18,2),
  source_type           journal_source_type,
  result_coa_id         uuid not null references coa(id),
  bank_coa_override_id  uuid references coa(id),
  no_outlet_needed       boolean not null default false,     -- e.g. Mutasi antar unit, Angsuran, Prive
  priority              integer not null default 100,
  active                boolean not null default true,
  created_by            uuid references profiles(id),
  created_at            timestamptz not null default now()
);
create index idx_coa_rule_priority on coa_mapping_rules (priority) where active;

create table exceptions (
  id                       uuid primary key default uuid_generate_v4(),
  source_table             text not null check (source_table in ('bank_transactions_raw','revenue_transactions_raw')),
  source_id                uuid not null,
  exception_type           exception_type not null,
  suggested_outlet_id      uuid references outlets(id),
  suggested_coa_id         uuid references coa(id),
  status                   exception_status not null default 'open',
  resolved_outlet_id       uuid references outlets(id),
  resolved_coa_id          uuid references coa(id),
  create_rule_on_resolve   boolean not null default false,
  resolution_note          text,
  resolved_by              uuid references profiles(id),
  resolved_at              timestamptz,
  created_at               timestamptz not null default now(),
  unique (source_table, source_id)   -- one open/resolved exception record per source row
);
create index idx_exception_open on exceptions (status) where status = 'open';
create index idx_exception_source on exceptions (source_table, source_id);
