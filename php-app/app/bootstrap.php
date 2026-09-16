<?php

declare(strict_types=1);

/**
 * Shared bootstrap for both the web front controller (public/index.php)
 * and every CLI entry point (database/migrate.php, cron/*.php, tests).
 * Keeping this in one file means "how the app boots" can never drift
 * between the web path and a cron/CLI path - the exact class of bug that
 * would otherwise let, say, the web app enforce a config value a cron
 * script silently skips.
 */

require_once dirname(__DIR__) . '/vendor/autoload.php';

use App\Helpers\Env;

define('APP_BASE_PATH', dirname(__DIR__));

// PFS_ENV_FILE lets the test bootstrap point this at .env.testing
// instead of the real .env, without needing two copies of this file -
// tests/bootstrap.php sets it via putenv() before requiring this file.
$envFile = getenv('PFS_ENV_FILE');
Env::load($envFile !== false ? $envFile : APP_BASE_PATH . '/.env');

date_default_timezone_set('Asia/Jakarta');

/** @var array<string, array<string, mixed>> $GLOBALS['__config_cache'] */
$GLOBALS['__config_cache'] = [];

/**
 * config('database.host') style accessor, dot-notation into
 * config/<file>.php arrays. Deliberately global-function-simple (no
 * container/DI framework) - this app has no dependency injection needs
 * beyond "read a config value" and "get the DB connection" (see
 * App\Database\Connection::instance()).
 */
function config(string $key, mixed $default = null): mixed
{
    [$file, $path] = array_pad(explode('.', $key, 2), 2, null);

    if (!isset($GLOBALS['__config_cache'][$file])) {
        $configPath = APP_BASE_PATH . "/config/{$file}.php";
        $GLOBALS['__config_cache'][$file] = is_file($configPath) ? require $configPath : [];
    }

    if ($path === null) {
        return $GLOBALS['__config_cache'][$file];
    }

    $value = $GLOBALS['__config_cache'][$file];
    foreach (explode('.', $path) as $segment) {
        if (!is_array($value) || !array_key_exists($segment, $value)) {
            return $default;
        }
        $value = $value[$segment];
    }
    return $value;
}
