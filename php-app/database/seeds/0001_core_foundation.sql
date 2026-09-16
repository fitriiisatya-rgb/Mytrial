-- =====================================================================
-- Phase 1 seed data - one demo profile per role (matches the 5-role
-- model from the original system: super_admin, accounting,
-- finance_manager, management, investor), plus one deliberately
-- disabled account for Phase 1 test #3 ("disabled user rejected").
--
-- Fixed UUIDs (same convention the original Postgres seed.sql used) so
-- tests/Feature can reference them deterministically without querying
-- for "the seeded accounting user" by email first.
--
-- Password for every seeded account is: Password123!
-- (bcrypt hash below is for that exact string - CHANGE IMMEDIATELY in
-- any real deployment; this seed file is for local/CI/demo use only,
-- never appropriate to import as-is on a real production database.)
-- =====================================================================

INSERT INTO profiles (id, name, email, role, password_hash, is_active) VALUES
  ('a0000000-0000-0000-0000-00000000a001', 'Super Admin', 'superadmin@example.com', 'super_admin', '$2y$12$n5RylagjyZSdObhDfLusd.59VC3Uj29Imo.lq/q/tPSisdbdyFHZm', 1),
  ('a0000000-0000-0000-0000-00000000a002', 'Accounting Staff', 'accounting@example.com', 'accounting', '$2y$12$n5RylagjyZSdObhDfLusd.59VC3Uj29Imo.lq/q/tPSisdbdyFHZm', 1),
  ('a0000000-0000-0000-0000-00000000a003', 'Finance Manager', 'financemanager@example.com', 'finance_manager', '$2y$12$n5RylagjyZSdObhDfLusd.59VC3Uj29Imo.lq/q/tPSisdbdyFHZm', 1),
  ('a0000000-0000-0000-0000-00000000a004', 'Management', 'management@example.com', 'management', '$2y$12$n5RylagjyZSdObhDfLusd.59VC3Uj29Imo.lq/q/tPSisdbdyFHZm', 1),
  ('a0000000-0000-0000-0000-00000000a005', 'Investor Demo', 'investor@example.com', 'investor', '$2y$12$n5RylagjyZSdObhDfLusd.59VC3Uj29Imo.lq/q/tPSisdbdyFHZm', 1),
  ('a0000000-0000-0000-0000-00000000a006', 'Disabled Account', 'disabled@example.com', 'accounting', '$2y$12$n5RylagjyZSdObhDfLusd.59VC3Uj29Imo.lq/q/tPSisdbdyFHZm', 0)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  role = VALUES(role),
  password_hash = VALUES(password_hash),
  is_active = VALUES(is_active);
