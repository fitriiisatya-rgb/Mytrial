<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Connection;
use App\Helpers\Uuid;

/**
 * One write path to audit_log for the whole app - every mutating
 * Service method (starting with AuthService's login/failed-login
 * events in this phase, every Master Data/Journal/... mutation from
 * Phase 2 onward) ends with a call here, mirroring exactly how every
 * guarded Postgres function in the original system ended with
 * `insert into audit_log`.
 *
 * Redaction rule: password_hash (and any future secret field) must
 * NEVER appear in old_value/new_value - self::redact() strips it
 * defensively even if a caller forgets, so a credential can't leak into
 * an audit trail that itself deserves broad staff readability.
 */
final class AuditService
{
    private const REDACTED_KEYS = ['password', 'password_hash', 'password_confirmation'];

    /**
     * @param array<string, mixed>|null $oldValue
     * @param array<string, mixed>|null $newValue
     */
    public static function log(
        ?string $userId,
        string $action,
        string $entityTable,
        ?string $entityId,
        ?array $oldValue = null,
        ?array $newValue = null
    ): void {
        $stmt = Connection::instance()->prepare(
            'INSERT INTO audit_log (id, user_id, action, entity_table, entity_id, old_value, new_value)
             VALUES (:id, :user_id, :action, :entity_table, :entity_id, :old_value, :new_value)'
        );
        $stmt->execute([
            'id' => Uuid::v4(),
            'user_id' => $userId,
            'action' => $action,
            'entity_table' => $entityTable,
            'entity_id' => $entityId,
            'old_value' => $oldValue === null ? null : json_encode(self::redact($oldValue), JSON_UNESCAPED_SLASHES),
            'new_value' => $newValue === null ? null : json_encode(self::redact($newValue), JSON_UNESCAPED_SLASHES),
        ]);
    }

    /** @param array<string, mixed> $value @return array<string, mixed> */
    private static function redact(array $value): array
    {
        foreach (self::REDACTED_KEYS as $key) {
            if (array_key_exists($key, $value)) {
                $value[$key] = '[redacted]';
            }
        }
        return $value;
    }
}
