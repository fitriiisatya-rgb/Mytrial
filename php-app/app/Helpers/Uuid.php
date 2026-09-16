<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * UUIDv4 generation, application-side (never a DB default) - the
 * primary-key strategy this project settled on for MySQL: CHAR(36),
 * human-readable in phpMyAdmin, no BIN_TO_UUID()/UUID_TO_BIN()
 * conversion needed at any query boundary. See
 * MIGRATION_TO_CPANEL_MYSQL_PLAN.md sec.5 "Primary keys / UUIDs".
 */
final class Uuid
{
    public static function v4(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40); // version 4
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80); // variant

        $hex = bin2hex($data);
        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12)
        );
    }
}
