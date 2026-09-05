-- =====================================================================
-- 0001 — EXTENSIONS & ENUM TYPES
-- =====================================================================
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create type user_role as enum
  ('super_admin', 'accounting', 'finance_manager', 'management', 'investor');

create type account_type as enum
  ('asset', 'liability', 'equity', 'revenue', 'cogs',
   'operating_expense', 'other_income', 'other_expense');

create type normal_balance as enum ('debit', 'credit');

-- CORRECTION #2 (journal workflow): explicit, ordered workflow states.
-- Only 'posted' journals are ever visible to GL/P&L (enforced by view,
-- see 0005).
create type journal_status as enum
  ('draft', 'reviewed', 'approved', 'posted', 'reversed');

create type journal_source_type as enum
  ('bank_expense', 'revenue', 'manual', 'allocation',
   'interbank_transfer', 'opening_balance');

create type pnl_status as enum ('draft', 'reviewed', 'approved', 'published');

create type period_status as enum ('open', 'review', 'closed', 'published');

create type distribution_status as enum
  ('calculated', 'reviewed', 'approved', 'paid');

create type exception_type as enum
  ('outlet_not_detected', 'coa_not_detected', 'missing_bank_coa',
   'duplicate_suspected', 'invalid_amount', 'invalid_date',
   'unknown_classification', 'interbank_transfer', 'possible_reversal',
   'malformed_data', 'ownership_invalid', 'revenue_source_incomplete');

create type exception_status as enum ('open', 'resolved', 'ignored');

create type allocation_method as enum
  ('equal', 'revenue_percentage', 'custom_percentage', 'manual_amount');

create type match_type as enum ('exact', 'keyword', 'regex');

create type import_source_type as enum
  ('csv_upload', 'excel_upload', 'google_sheet');

-- Generic audit helper used by several triggers in later migrations.
create or replace function fn_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
