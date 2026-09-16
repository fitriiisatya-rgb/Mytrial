<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Wires the DB-backed session handler + secure cookie params + starts
 * the session. One call site (public/index.php); tests call it too so
 * a Feature test exercises the exact same session configuration
 * production uses, not a relaxed test-only version.
 */
final class SessionBootstrap
{
    private static bool $started = false;

    public static function start(): void
    {
        if (self::$started || session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        session_set_save_handler(new DbSessionHandler());

        $lifetimeSeconds = config('session.lifetime_minutes', 120) * 60;

        session_set_cookie_params([
            'lifetime' => $lifetimeSeconds,
            'path' => '/',
            'domain' => '',
            'secure' => (bool) config('session.cookie_secure', true),
            'httponly' => true,
            'samesite' => config('session.cookie_samesite', 'Lax'),
        ]);

        session_name((string) config('session.cookie_name', 'pfs_session'));
        ini_set('session.gc_maxlifetime', (string) $lifetimeSeconds);
        ini_set('session.use_strict_mode', '1');

        session_start();
        self::$started = true;
    }

    /** Test-only: forces a fresh session_start() call in the next test. */
    public static function reset(): void
    {
        self::$started = false;
    }
}
