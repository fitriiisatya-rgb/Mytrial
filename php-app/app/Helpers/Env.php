<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Minimal .env loader - deliberately dependency-free (no vlucas/phpdotenv)
 * so Phase 1 needs zero Composer packages at runtime. Parses KEY=VALUE
 * lines, ignores blank lines and lines starting with '#', strips optional
 * surrounding quotes. Values are read via getenv()/Env::get() everywhere
 * else in the app - never $_ENV directly - so a real server-level env var
 * (set via cPanel's "Setup PHP App" env editor, when available) silently
 * takes precedence over the .env file without any code change.
 */
final class Env
{
    private static bool $loaded = false;

    public static function load(string $path): void
    {
        if (self::$loaded) {
            return;
        }
        self::$loaded = true;

        if (!is_file($path) || !is_readable($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            $eq = strpos($line, '=');
            if ($eq === false) {
                continue;
            }
            $key = trim(substr($line, 0, $eq));
            $value = trim(substr($line, $eq + 1));
            $value = self::stripQuotes($value);

            // Never override a real server-level environment variable.
            if (getenv($key) === false) {
                putenv("{$key}={$value}");
                $_ENV[$key] = $value;
            }
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $value = getenv($key);
        if ($value === false) {
            return $default;
        }
        return $value;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $value = self::get($key);
        if ($value === null) {
            return $default;
        }
        return in_array(strtolower((string) $value), ['1', 'true', 'yes', 'on'], true);
    }

    public static function int(string $key, int $default = 0): int
    {
        $value = self::get($key);
        return $value === null ? $default : (int) $value;
    }

    private static function stripQuotes(string $value): string
    {
        if (strlen($value) >= 2) {
            $first = $value[0];
            $last = $value[strlen($value) - 1];
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                return substr($value, 1, -1);
            }
        }
        return $value;
    }
}
