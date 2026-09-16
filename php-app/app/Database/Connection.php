<?php

declare(strict_types=1);

namespace App\Database;

use PDO;
use PDOException;

/**
 * Single PDO connection per request, always MySQL/MariaDB, always
 * prepared statements (ATTR_EMULATE_PREPARES = false - real server-side
 * prepares, so a malicious value can never be re-interpreted as SQL no
 * matter how the query string is built downstream). No ORM: every write
 * that must be atomic goes through Connection::transaction() rather than
 * relying on autocommit, per CPANEL_MYSQL_IMPLEMENTATION_PLAN.md's
 * "Database Transaction Strategy" section.
 */
final class Connection
{
    private static ?PDO $instance = null;

    public static function instance(): PDO
    {
        if (self::$instance === null) {
            self::$instance = self::connect();
        }
        return self::$instance;
    }

    /** Used by tests to force a fresh connection against a clean fixture DB. */
    public static function reset(): void
    {
        self::$instance = null;
    }

    private static function connect(): PDO
    {
        $host = config('database.host');
        $port = config('database.port');
        $db = config('database.database');
        $charset = config('database.charset', 'utf8mb4');

        $dsn = "mysql:host={$host};port={$port};dbname={$db};charset={$charset}";

        try {
            return new PDO(
                $dsn,
                (string) config('database.username'),
                (string) config('database.password'),
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$charset}",
                ]
            );
        } catch (PDOException $e) {
            // Never let a raw PDOException reach output - it can include
            // the DSN, which includes the database name.
            throw new \RuntimeException('Database connection failed. Check config/database.php and .env.', 0, $e);
        }
    }

    /**
     * Runs $callback inside one transaction; commits on success, rolls
     * back on any exception. Retries once on InnoDB deadlock (MySQL
     * error code 1213) per the implementation plan's deadlock-handling
     * note - cheap insurance for concurrent writes, not expected to fire
     * often at this system's realistic concurrency.
     *
     * @template T
     * @param callable(PDO): T $callback
     * @return T
     */
    public static function transaction(callable $callback, int $retriesLeft = 1): mixed
    {
        $pdo = self::instance();
        $pdo->beginTransaction();
        try {
            $result = $callback($pdo);
            $pdo->commit();
            return $result;
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($retriesLeft > 0 && self::isDeadlock($e)) {
                return self::transaction($callback, $retriesLeft - 1);
            }
            throw $e;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    private static function isDeadlock(PDOException $e): bool
    {
        return ($e->errorInfo[1] ?? null) === 1213;
    }
}
