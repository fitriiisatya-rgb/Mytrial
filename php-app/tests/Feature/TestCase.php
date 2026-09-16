<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Database\Connection;
use App\Services\SessionBootstrap;
use PHPUnit\Framework\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected const PASSWORD = 'Password123!';
    // password_hash('Password123!', PASSWORD_BCRYPT) computed once - see database/seeds/0001_core_foundation.sql for the same constant.
    protected const PASSWORD_HASH = '$2y$12$n5RylagjyZSdObhDfLusd.59VC3Uj29Imo.lq/q/tPSisdbdyFHZm';

    protected const SUPER_ADMIN_ID = 'a0000000-0000-0000-0000-00000000a001';
    protected const ACCOUNTING_ID = 'a0000000-0000-0000-0000-00000000a002';
    protected const FINANCE_MANAGER_ID = 'a0000000-0000-0000-0000-00000000a003';
    protected const MANAGEMENT_ID = 'a0000000-0000-0000-0000-00000000a004';
    protected const INVESTOR_ID = 'a0000000-0000-0000-0000-00000000a005';
    protected const DISABLED_ID = 'a0000000-0000-0000-0000-00000000a006';

    // Phase 2 fixture ids - fixed, mirroring the dev seed's own convention
    // (database/seeds/0002_master_data.sql) but namespaced to a separate
    // 'b'-prefixed range so a test run can never collide with dev-seed
    // rows if a test is ever pointed at the wrong database by mistake.
    protected const ENTITY_ID = 'b0000000-0000-0000-0000-000000000001';
    protected const OUTLET_A_ID = 'b0000000-0000-0000-0000-000000000011';
    protected const OUTLET_B_ID = 'b0000000-0000-0000-0000-000000000012';
    protected const COA_ASSET_PARENT_ID = 'b0000000-0000-0000-0000-000000000021';
    protected const COA_BANK_A_ID = 'b0000000-0000-0000-0000-000000000022';
    protected const COA_BANK_B_ID = 'b0000000-0000-0000-0000-000000000023';
    protected const COA_BANK_SPARE_ID = 'b0000000-0000-0000-0000-000000000024';
    protected const BANK_A_ID = 'b0000000-0000-0000-0000-000000000031';
    protected const INVESTOR_A_ID = 'b0000000-0000-0000-0000-000000000041';
    protected const INVESTOR_B_ID = 'b0000000-0000-0000-0000-000000000042';
    protected const INVESTOR_NO_LOGIN_ID = 'b0000000-0000-0000-0000-000000000043';
    protected const CONTRACT_A_ID = 'b0000000-0000-0000-0000-000000000051';

    private static bool $schemaReady = false;

    protected function setUp(): void
    {
        parent::setUp();
        $_GET = [];
        $_POST = [];
        $this->ensureSchema();
        $this->resetDatabase();
        $this->startFreshSession();
    }

    protected function tearDown(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        parent::tearDown();
    }

    private function ensureSchema(): void
    {
        if (self::$schemaReady) {
            return;
        }
        $pdo = Connection::instance();
        $pdo->exec((string) file_get_contents(dirname(__DIR__, 2) . '/database/schema/0001_core_foundation.sql'));
        $pdo->exec((string) file_get_contents(dirname(__DIR__, 2) . '/database/schema/0002_master_data.sql'));
        $pdo->exec((string) file_get_contents(dirname(__DIR__, 2) . '/database/schema/0003_transaction_import.sql'));
        self::$schemaReady = true;
    }

    /** Wipes every Phase 1+2 table and reseeds exactly the fixed-id fixture this test suite depends on - full isolation between tests, no leftover state from a previous test. */
    private function resetDatabase(): void
    {
        $pdo = Connection::instance();

        // FK checks off just for the wipe - every Phase 2 table has FKs
        // pointing at another Phase 2 table (and some self-reference,
        // e.g. coa.parent_id), so deleting all rows in dependency order
        // is more fragile than briefly disabling checks for a full reset.
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ([
            'normalized_bank_transactions', 'normalized_revenue_transactions', 'raw_import_rows',
            'import_batches', 'import_sources',
            'investor_ownerships', 'partnership_contracts', 'banks', 'outlets', 'coa', 'investors',
            'accounting_periods', 'entities',
            'audit_log', 'sessions', 'password_reset_tokens', 'login_attempts', 'profiles',
        ] as $table) {
            $pdo->exec("DELETE FROM {$table}");
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        $this->seedProfiles($pdo);
        $this->seedMasterData($pdo);
    }

    private function seedProfiles(\PDO $pdo): void
    {
        $insert = $pdo->prepare(
            'INSERT INTO profiles (id, name, email, role, password_hash, is_active) VALUES (:id, :name, :email, :role, :hash, :active)'
        );
        $rows = [
            [self::SUPER_ADMIN_ID, 'Super Admin', 'superadmin@example.com', 'super_admin', 1],
            [self::ACCOUNTING_ID, 'Accounting Staff', 'accounting@example.com', 'accounting', 1],
            [self::FINANCE_MANAGER_ID, 'Finance Manager', 'financemanager@example.com', 'finance_manager', 1],
            [self::MANAGEMENT_ID, 'Management', 'management@example.com', 'management', 1],
            [self::INVESTOR_ID, 'Investor Demo', 'investor@example.com', 'investor', 1],
            [self::DISABLED_ID, 'Disabled Account', 'disabled@example.com', 'accounting', 0],
        ];
        foreach ($rows as [$id, $name, $email, $role, $active]) {
            $insert->execute(['id' => $id, 'name' => $name, 'email' => $email, 'role' => $role, 'hash' => self::PASSWORD_HASH, 'active' => $active]);
        }
    }

    /** One entity, two outlets, a small COA tree (with 3 distinct bank-eligible leaf accounts), one bank, three investors (one deliberately without a login account), one active contract. Minimal but enough for every Phase 2 test's happy path plus its edge cases. */
    private function seedMasterData(\PDO $pdo): void
    {
        $pdo->prepare('INSERT INTO entities (id, code, name, status) VALUES (:id, :code, :name, :status)')->execute([
            'id' => self::ENTITY_ID, 'code' => 'TSTENT', 'name' => 'Test Entity', 'status' => 'active',
        ]);

        $outletStmt = $pdo->prepare('INSERT INTO outlets (id, entity_id, code, name, status) VALUES (:id, :entity_id, :code, :name, :status)');
        $outletStmt->execute(['id' => self::OUTLET_A_ID, 'entity_id' => self::ENTITY_ID, 'code' => 'OUT-A', 'name' => 'Outlet A', 'status' => 'active']);
        $outletStmt->execute(['id' => self::OUTLET_B_ID, 'entity_id' => self::ENTITY_ID, 'code' => 'OUT-B', 'name' => 'Outlet B', 'status' => 'active']);

        $coaStmt = $pdo->prepare(
            'INSERT INTO coa (id, code, name, account_type, parent_id, normal_balance, is_active) VALUES (:id, :code, :name, :type, :parent, :nb, 1)'
        );
        $coaStmt->execute(['id' => self::COA_ASSET_PARENT_ID, 'code' => '101000', 'name' => 'Kas & Bank', 'type' => 'asset', 'parent' => null, 'nb' => 'debit']);
        $coaStmt->execute(['id' => self::COA_BANK_A_ID, 'code' => '101101', 'name' => 'Bank A Operasional', 'type' => 'asset', 'parent' => self::COA_ASSET_PARENT_ID, 'nb' => 'debit']);
        $coaStmt->execute(['id' => self::COA_BANK_B_ID, 'code' => '101102', 'name' => 'Bank B Operasional', 'type' => 'asset', 'parent' => self::COA_ASSET_PARENT_ID, 'nb' => 'debit']);
        $coaStmt->execute(['id' => self::COA_BANK_SPARE_ID, 'code' => '101103', 'name' => 'Bank Spare (unused)', 'type' => 'asset', 'parent' => self::COA_ASSET_PARENT_ID, 'nb' => 'debit']);

        $pdo->prepare('INSERT INTO banks (id, entity_id, bank_name, account_number, account_name, coa_id, is_active) VALUES (:id, :entity_id, :bank_name, :account_number, :account_name, :coa_id, 1)')->execute([
            'id' => self::BANK_A_ID, 'entity_id' => self::ENTITY_ID, 'bank_name' => 'Test Bank', 'account_number' => '111-000', 'account_name' => 'Test Entity - Bank A', 'coa_id' => self::COA_BANK_A_ID,
        ]);

        $investorStmt = $pdo->prepare('INSERT INTO investors (id, code, full_name, email, profile_id, status) VALUES (:id, :code, :name, :email, :profile_id, :status)');
        $investorStmt->execute(['id' => self::INVESTOR_A_ID, 'code' => 'INV-A', 'name' => 'Investor A', 'email' => 'investora@example.com', 'profile_id' => null, 'status' => 'active']);
        $investorStmt->execute(['id' => self::INVESTOR_B_ID, 'code' => 'INV-B', 'name' => 'Investor B', 'email' => 'investorb@example.com', 'profile_id' => self::INVESTOR_ID, 'status' => 'active']);
        $investorStmt->execute(['id' => self::INVESTOR_NO_LOGIN_ID, 'code' => 'INV-NOLOGIN', 'name' => 'Investor No Login', 'email' => null, 'profile_id' => null, 'status' => 'active']);

        $pdo->prepare(
            'INSERT INTO partnership_contracts (id, outlet_id, contract_number, start_date, end_date, total_investment, profit_distribution_pct, status)
             VALUES (:id, :outlet_id, :n, :start, :end, :inv, :pct, :status)'
        )->execute([
            'id' => self::CONTRACT_A_ID, 'outlet_id' => self::OUTLET_A_ID, 'n' => 'PC-TEST-001',
            'start' => '2024-01-01', 'end' => '2029-01-01', 'inv' => '100000000.00', 'pct' => '70.000', 'status' => 'active',
        ]);
    }

    /** Forces a brand new PHP session (own id, empty $_SESSION) so tests never share session state. */
    protected function startFreshSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        SessionBootstrap::reset();
        session_id(bin2hex(random_bytes(16)));
        $_SESSION = [];
        SessionBootstrap::start();
    }

    protected function loginAs(string $userId, string $role): void
    {
        $_SESSION['user_id'] = $userId;
        $_SESSION['role'] = $role;
    }

    protected function sessionRowExists(string $sessionId): bool
    {
        $stmt = Connection::instance()->prepare('SELECT 1 FROM sessions WHERE id = :id');
        $stmt->execute(['id' => $sessionId]);
        return $stmt->fetch() !== false;
    }

    protected function countAuditLogs(string $action): int
    {
        $stmt = Connection::instance()->prepare('SELECT COUNT(*) AS c FROM audit_log WHERE action = :action');
        $stmt->execute(['action' => $action]);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }
}
