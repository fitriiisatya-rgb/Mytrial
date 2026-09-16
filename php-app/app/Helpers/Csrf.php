<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * One CSRF token per session (not per-request) - regenerated per request
 * would break multi-tab use, per-session survives it while still being
 * useless to an attacker who cannot read the victim's session cookie.
 */
final class Csrf
{
    private const SESSION_KEY = '_csrf_token';

    public static function token(): string
    {
        if (!isset($_SESSION[self::SESSION_KEY]) || !is_string($_SESSION[self::SESSION_KEY])) {
            $_SESSION[self::SESSION_KEY] = bin2hex(random_bytes(32));
        }
        return $_SESSION[self::SESSION_KEY];
    }

    public static function verify(?string $submitted): bool
    {
        $expected = $_SESSION[self::SESSION_KEY] ?? null;
        if (!is_string($expected) || !is_string($submitted) || $submitted === '') {
            return false;
        }
        return hash_equals($expected, $submitted);
    }

    /** Renders a hidden <input> for a form - always output-escaped even though the token itself is hex. */
    public static function field(): string
    {
        return '<input type="hidden" name="_csrf_token" value="' . e(self::token()) . '">';
    }
}
