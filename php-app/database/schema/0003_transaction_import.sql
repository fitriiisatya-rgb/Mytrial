-- =====================================================================
-- Phase 3 - Transaction Import
-- import_sources, import_batches, raw_import_rows,
-- normalized_bank_transactions, normalized_revenue_transactions.
-- CSV/XLSX are import sources only - MySQL remains the system of
-- record (spec: "CSV/XLSX HANYA source import. Bukan database utama.").
-- InnoDB + utf8mb4, CHAR(36) app-generated UUIDs, DECIMAL(20,2) money,
-- consistent with Phase 1/2.
-- =====================================================================

-- Reusable per-source column-mapping config (spec O) - one row per
-- distinct upload source a user has configured (e.g. "Buku Bank BCA
-- Operasional", "Revenue Outlet Bekasi"). Optional: an ad-hoc upload
-- with no saved source still works using the default mapping.
CREATE TABLE IF NOT EXISTS import_sources (
  id CHAR(36) NOT NULL PRIMARY KEY,
  source_type ENUM('bank_expense', 'revenue') NOT NULL,
  name VARCHAR(255) NOT NULL,
  entity_id CHAR(36) NULL,
  column_mapping JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_import_sources_entity (entity_id),
  CONSTRAINT fk_import_sources_entity FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_batches (
  id CHAR(36) NOT NULL PRIMARY KEY,
  source_type ENUM('bank_expense', 'revenue') NOT NULL,
  source_name VARCHAR(255) NULL,
  import_source_id CHAR(36) NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NULL,
  file_checksum CHAR(64) NULL,
  entity_id CHAR(36) NULL,
  uploaded_by CHAR(36) NULL,
  header_row_number INT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  total_rows INT NOT NULL DEFAULT 0,
  candidate_rows INT NOT NULL DEFAULT 0,
  valid_rows INT NOT NULL DEFAULT 0,
  ignored_rows INT NOT NULL DEFAULT 0,
  duplicate_rows INT NOT NULL DEFAULT 0,
  suspected_duplicate_rows INT NOT NULL DEFAULT 0,
  error_rows INT NOT NULL DEFAULT 0,
  status ENUM('pending', 'previewed', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  failure_reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_batches_source_type (source_type),
  KEY idx_batches_created_at (created_at),
  KEY idx_batches_entity (entity_id),
  CONSTRAINT fk_batches_source FOREIGN KEY (import_source_id) REFERENCES import_sources(id) ON DELETE SET NULL,
  CONSTRAINT fk_batches_entity FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL,
  CONSTRAINT fk_batches_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The original source row, preserved byte-for-byte (as parsed cell
-- values) for audit - normalization never loses the original (spec D).
CREATE TABLE IF NOT EXISTS raw_import_rows (
  id CHAR(36) NOT NULL PRIMARY KEY,
  import_batch_id CHAR(36) NOT NULL,
  source_row_number INT NOT NULL,
  raw_payload JSON NOT NULL,
  parse_status ENUM('ok', 'error') NOT NULL DEFAULT 'ok',
  parse_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_raw_rows_batch (import_batch_id),
  CONSTRAINT fk_raw_rows_batch FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kredit > 0 candidate-expense rows (and every other row status,
-- preserved rather than dropped - spec I). dedupe_key = fingerprint +
-- occurrence_index computed from THIS FILE's own row order (see
-- App\Services\Import\BankRowClassifier) - re-importing the identical
-- file reproduces the identical dedupe_keys, making re-import
-- idempotent, while genuinely repeated same-day/same-amount real
-- transactions each get their own distinct occurrence_index and are
-- never treated as duplicates of each other (spec B/J).
CREATE TABLE IF NOT EXISTS normalized_bank_transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  import_batch_id CHAR(36) NOT NULL,
  raw_row_id CHAR(36) NOT NULL,
  bank_account_id CHAR(36) NULL,
  transaction_date DATE NULL,
  source_unit VARCHAR(255) NULL,
  classification VARCHAR(255) NULL,
  description VARCHAR(1000) NULL,
  debit_amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  credit_amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  balance_amount DECIMAL(20,2) NULL,
  normalized_amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  transaction_type ENUM('expense_candidate', 'debit_only_ignored', 'not_candidate', 'invalid') NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  occurrence_index INT NOT NULL DEFAULT 1,
  dedupe_key VARCHAR(140) NOT NULL,
  duplicate_status ENUM('none', 'duplicate_exact', 'duplicate_suspected') NOT NULL DEFAULT 'none',
  validation_status ENUM('valid', 'bank_not_found', 'invalid_date', 'invalid_amount', 'both_debit_credit', 'negative_amount') NOT NULL DEFAULT 'valid',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bank_tx_dedupe_key (dedupe_key),
  KEY idx_bank_tx_batch (import_batch_id),
  KEY idx_bank_tx_date (transaction_date),
  KEY idx_bank_tx_bank_account (bank_account_id),
  KEY idx_bank_tx_fingerprint (fingerprint),
  KEY idx_bank_tx_duplicate_status (duplicate_status),
  KEY idx_bank_tx_validation_status (validation_status),
  CONSTRAINT fk_bank_tx_batch FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
  CONSTRAINT fk_bank_tx_raw_row FOREIGN KEY (raw_row_id) REFERENCES raw_import_rows(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bank_tx_bank_account FOREIGN KEY (bank_account_id) REFERENCES banks(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Revenue is a separate, generic source (spec S) - never a journal
-- here (that is a later phase); outlet_id is matched against Phase 2
-- master data, never a bank account.
CREATE TABLE IF NOT EXISTS normalized_revenue_transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  import_batch_id CHAR(36) NOT NULL,
  raw_row_id CHAR(36) NOT NULL,
  outlet_id CHAR(36) NULL,
  transaction_date DATE NULL,
  revenue_category VARCHAR(255) NULL,
  description VARCHAR(1000) NULL,
  amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  external_reference VARCHAR(255) NULL,
  fingerprint CHAR(64) NOT NULL,
  occurrence_index INT NOT NULL DEFAULT 1,
  dedupe_key VARCHAR(140) NOT NULL,
  duplicate_status ENUM('none', 'duplicate_exact', 'duplicate_suspected') NOT NULL DEFAULT 'none',
  validation_status ENUM('valid', 'outlet_not_found', 'invalid_date', 'invalid_amount') NOT NULL DEFAULT 'valid',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_revenue_tx_dedupe_key (dedupe_key),
  KEY idx_revenue_tx_batch (import_batch_id),
  KEY idx_revenue_tx_date (transaction_date),
  KEY idx_revenue_tx_outlet (outlet_id),
  KEY idx_revenue_tx_fingerprint (fingerprint),
  KEY idx_revenue_tx_duplicate_status (duplicate_status),
  KEY idx_revenue_tx_validation_status (validation_status),
  CONSTRAINT fk_revenue_tx_batch FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
  CONSTRAINT fk_revenue_tx_raw_row FOREIGN KEY (raw_row_id) REFERENCES raw_import_rows(id) ON DELETE RESTRICT,
  CONSTRAINT fk_revenue_tx_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
