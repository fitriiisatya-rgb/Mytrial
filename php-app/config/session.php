<?php

declare(strict_types=1);

use App\Helpers\Env;

return [
    'cookie_name' => Env::get('SESSION_COOKIE_NAME', 'pfs_session'),
    'lifetime_minutes' => Env::int('SESSION_LIFETIME_MINUTES', 120),
    // Forced true unless explicitly overridden - see CPANEL_DEPLOYMENT_NOTES.md
    // for the one legitimate reason to set this false (local HTTP-only dev).
    'cookie_secure' => Env::bool('SESSION_COOKIE_SECURE', true),
    'cookie_samesite' => 'Lax',
];
