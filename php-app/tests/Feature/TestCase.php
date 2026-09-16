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

    protected const ACCOUNTING_ID = 'a0000000-0000-0000-0000-00000000a002';
    protected const FINANCE_MANAGER_ID = 'a0000000-0000-0000-0000-00000000a003';
    protected const INVESTOR_ID = 'a0000000-0000-0000-0000-00000000a005';
    protected const DISABLED_ID = 'a0000000-0000-0000-0000-00000000a006';

    private static bool $schemaReady = false;

    protected function setUp(): void
    {
        parent::setUp();
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
        self::$schemaReady = true;
    }

    /** Wipes every Phase 1 table and reseeds exactly the fixed-id profiles this test suite depends on - full isolation between tests, no leftover state from a previous test. */
    private function resetDatabase(): void
    {
        $pdo = Connection::instance();
        foreach (['audit_log', 'sessions', 'password_reset_tokens', 'login_attempts', 'profiles'] as $table) {
            $pdo->exec("DELETE FROM {$table}");
        }

        $insert = $pdo->prepare(
            'INSERT INTO profiles (id, name, email, role, password_hash, is_active) VALUES (:id, :name, :email, :role, :hash, :active)'
        );
        $rows = [
            [self::ACCOUNTING_ID, 'Accounting Staff', 'accounting@example.com', 'accounting', 1],
            [self::FINANCE_MANAGER_ID, 'Finance Manager', 'financemanager@example.com', 'finance_manager', 1],
            [self::INVESTOR_ID, 'Investor Demo', 'investor@example.com', 'investor', 1],
            [self::DISABLED_ID, 'Disabled Account', 'disabled@example.com', 'accounting', 0],
        ];
        foreach ($rows as [$id, $name, $email, $role, $active]) {
            $insert->execute(['id' => $id, 'name' => $name, 'email' => $email, 'role' => $role, 'hash' => self::PASSWORD_HASH, 'active' => $active]);
        }
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
