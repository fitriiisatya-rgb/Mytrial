<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Output-escaping helper. Every value interpolated into a view MUST go
 * through e() - never printed with bare <?= $value ?>. This is the one
 * XSS defense this app has (no framework auto-escaping template engine
 * is in use), so it is a hard rule, not a style preference.
 */
final class Html
{
    public static function e(mixed $value): string
    {
        if ($value === null) {
            return '';
        }
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
