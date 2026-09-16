-- =====================================================================
-- Phase 2 - Master Data
-- entities, outlets, coa, banks, investors, partnership_contracts,
-- investor_ownerships, accounting_periods. MySQL/MariaDB translation of
-- the original Postgres 0002_master_data.sql, per
-- CPANEL_MYSQL_IMPLEMENTATION_PLAN.md's schema plan: CHAR(36)
-- application-generated UUIDs, DECIMAL(20,2) money, is_active/status
-- flags (never a hard delete), InnoDB + utf8mb4 throughout.
--
-- `banks` (not `bank_accounts`) is the deliberate table name for the
-- accounting master "Bank Account" module - `bank_accounts` is reserved
-- for the Cashflow module's own, separate table (Phase 6), which FKs
-- back to THIS table rather than duplicating it. See
-- CPANEL_MYSQL_IMPLEMENTATION_PLAN.md's Phase 6 section.
-- =====================================================================

-- Phase 2 fix (found while writing this phase's audit tests): plain
-- DATETIME has only 1-second resolution, so two audit_log rows written
-- inside the same request/transaction (e.g. a Service method that both
-- inserts and audits, called twice within one HTTP request) can share
-- an identical created_at and sort unpredictably against each other -
-- their UUID primary keys carry no chronological order to fall back on.
-- Microsecond precision makes created_at a reliable ORDER BY on its own
-- for "what happened before what" without adding a second column.
ALTER TABLE audit_log MODIFY created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

CREATE TABLE IF NOT EXISTS entities (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_entities_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chart of Accounts created before `banks`/`outlets` reference it -
-- every bank account requires its own coa_id from the moment the row
-- exists (spec E: "COA WAJIB... jangan gunakan generic Kas & Bank").
CREATE TABLE IF NOT EXISTS coa (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_type ENUM('asset', 'liability', 'equity', 'revenue', 'expense') NOT NULL,
  parent_id CHAR(36) NULL,
  normal_balance ENUM('debit', 'credit') NOT NULL,
  -- NULL => balance sheet account, excluded from P&L by construction.
  pnl_category ENUM('revenue', 'cogs', 'opex', 'other_income', 'other_expense') NULL,
  reporting_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coa_code (code),
  KEY idx_coa_parent_id (parent_id),
  CONSTRAINT fk_coa_parent FOREIGN KEY (parent_id) REFERENCES coa(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outlets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  entity_id CHAR(36) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  area VARCHAR(255) NULL,
  address TEXT NULL,
  opening_date DATE NULL,
  partnership_start DATE NULL,
  partnership_end DATE NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_outlets_code (code),
  KEY idx_outlets_entity_id (entity_id),
  CONSTRAINT fk_outlets_entity FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every bank account MUST reference its own dedicated COA (spec E) -
-- coa_id is NOT NULL, no default, exactly like the original Postgres
-- `banks` table's CORRECTION #1.
CREATE TABLE IF NOT EXISTS banks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  entity_id CHAR(36) NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  coa_id CHAR(36) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_banks_name_account (bank_name, account_number),
  UNIQUE KEY uq_banks_coa_id (coa_id),
  KEY idx_banks_entity_id (entity_id),
  CONSTRAINT fk_banks_entity FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT,
  CONSTRAINT fk_banks_coa FOREIGN KEY (coa_id) REFERENCES coa(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS investors (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  -- Nullable on purpose (spec F): an investor is a real-world business
  -- record that can exist before any login account is provisioned for
  -- them - never force profile_id at creation time.
  profile_id CHAR(36) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_investors_code (code),
  KEY idx_investors_profile_id (profile_id),
  CONSTRAINT fk_investors_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS partnership_contracts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  outlet_id CHAR(36) NOT NULL,
  contract_number VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_months INT NULL,
  total_investment DECIMAL(20,2) NOT NULL DEFAULT 0,
  profit_distribution_pct DECIMAL(6,3) NOT NULL,
  retained_profit_pct DECIMAL(6,3) GENERATED ALWAYS AS (100 - profit_distribution_pct) STORED,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contracts_number (contract_number),
  KEY idx_contracts_outlet_id (outlet_id),
  CONSTRAINT fk_contracts_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE RESTRICT,
  CONSTRAINT chk_contracts_dates CHECK (end_date > start_date),
  CONSTRAINT chk_contracts_pct CHECK (profit_distribution_pct BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ownership is effective-dated and append-only (spec H/J): a change in
-- ownership NEVER overwrites a historical row - it ends the old row
-- (effective_to) and inserts a new one. The >100% guard (spec I) is
-- enforced in App\Services\OwnershipService inside a DB transaction with
-- SELECT ... FOR UPDATE, not by a DB trigger (MySQL stored procedures/
-- triggers are not assumed available on every shared-hosting DB user -
-- see MIGRATION_TO_CPANEL_MYSQL_PLAN.md sec.2 items 3/4).
CREATE TABLE IF NOT EXISTS investor_ownerships (
  id CHAR(36) NOT NULL PRIMARY KEY,
  investor_id CHAR(36) NOT NULL,
  outlet_id CHAR(36) NOT NULL,
  contract_id CHAR(36) NOT NULL,
  ownership_pct DECIMAL(9,6) NOT NULL,
  investment_amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ownerships_investor_id (investor_id),
  KEY idx_ownerships_outlet_id (outlet_id),
  KEY idx_ownerships_contract_id (contract_id),
  KEY idx_ownerships_effective_from (effective_from),
  KEY idx_ownerships_effective_to (effective_to),
  CONSTRAINT fk_ownerships_investor FOREIGN KEY (investor_id) REFERENCES investors(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownerships_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownerships_contract FOREIGN KEY (contract_id) REFERENCES partnership_contracts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ownerships_created_by FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_ownerships_pct CHECK (ownership_pct > 0 AND ownership_pct <= 100),
  CONSTRAINT chk_ownerships_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reserved for later phases' period-lock guard (Journal/GL, P&L) - no
-- UI ships for this in Phase 2, the table only needs to exist so
-- Phase 5 onward has somewhere to point without another schema change.
CREATE TABLE IF NOT EXISTS accounting_periods (
  id CHAR(36) NOT NULL PRIMARY KEY,
  entity_id CHAR(36) NOT NULL,
  period_month TINYINT NOT NULL,
  period_year SMALLINT NOT NULL,
  status ENUM('open', 'review', 'closed', 'published') NOT NULL DEFAULT 'open',
  closed_at DATETIME NULL,
  closed_by CHAR(36) NULL,
  published_at DATETIME NULL,
  reopened_at DATETIME NULL,
  reopened_by CHAR(36) NULL,
  reopen_reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_periods_entity_year_month (entity_id, period_year, period_month),
  CONSTRAINT fk_periods_entity FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT,
  CONSTRAINT fk_periods_closed_by FOREIGN KEY (closed_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_periods_reopened_by FOREIGN KEY (reopened_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_periods_month CHECK (period_month BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
