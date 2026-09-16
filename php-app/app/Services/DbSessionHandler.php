<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Connection;
use SessionHandlerInterface;

/**
 * DB-backed PHP session handler - see
 * CPANEL_MYSQL_IMPLEMENTATION_PLAN.md's Auth/Session Architecture
 * section for why this is the default over PHP's file-based handler on
 * shared hosting (unpredictable /tmp cleanup, file-count quotas on some
 * plans, zero visibility into "who is logged in right now"). Registered
 * via session_set_save_handler() before session_start() in
 * public/index.php and every CLI entry point that needs a session
 * (there are none in Phase 1, but tests exercise this the same way the
 * web path would).
 */
final class DbSessionHandler implements SessionHandlerInterface
{
    public function open(string $path, string $name): bool
    {
        return true;
    }

    public function close(): bool
    {
        return true;
    }

    public function read(string $id): string|false
    {
        $stmt = Connection::instance()->prepare('SELECT payload FROM sessions WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? '' : (string) $row['payload'];
    }

    public function write(string $id, string $data): bool
    {
        $userId = $_SESSION['user_id'] ?? null;
        $pdo = Connection::instance();
        $stmt = $pdo->prepare(
            'INSERT INTO sessions (id, user_id, payload, ip_address, user_agent, last_activity)
             VALUES (:id, :user_id, :payload, :ip, :ua, NOW())
             ON DUPLICATE KEY UPDATE
               user_id = VALUES(user_id),
               payload = VALUES(payload),
               ip_address = VALUES(ip_address),
               user_agent = VALUES(user_agent),
               last_activity = NOW()'
        );
        return $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
            'payload' => $data,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
            'ua' => isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 255) : null,
        ]);
    }

    public function destroy(string $id): bool
    {
        $stmt = Connection::instance()->prepare('DELETE FROM sessions WHERE id = :id');
        return $stmt->execute(['id' => $id]);
    }

    public function gc(int $max_lifetime): int|false
    {
        $stmt = Connection::instance()->prepare(
            'DELETE FROM sessions WHERE last_activity < DATE_SUB(NOW(), INTERVAL :seconds SECOND)'
        );
        $stmt->execute(['seconds' => $max_lifetime]);
        return $stmt->rowCount();
    }
}
