<?php

declare(strict_types=1);

use App\Helpers\Env;

return [
    'env' => Env::get('APP_ENV', 'production'),
    'debug' => Env::bool('APP_DEBUG', false),
    'url' => Env::get('APP_URL', ''),
    'key' => Env::get('APP_KEY', ''),
    'timezone' => 'Asia/Jakarta',

    // Absolute path to storage/ - never inside public/.
    'storage_path' => dirname(__DIR__) . '/storage',

    'login' => [
        'max_attempts' => Env::int('LOGIN_MAX_ATTEMPTS', 5),
        'lockout_minutes' => Env::int('LOGIN_LOCKOUT_MINUTES', 15),
    ],
];
