<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\HttpException;
use App\Services\AuthService;

/**
 * Requires an authenticated session. Any route that isn't public
 * (login, the static asset paths) must list this first in its
 * middleware array - a route that forgets it is reachable by anyone,
 * which is exactly the class of bug RLS used to make structurally
 * impossible and this architecture cannot make impossible by
 * construction, only by discipline (see
 * CPANEL_MYSQL_IMPLEMENTATION_PLAN.md's RBAC Architecture section).
 */
final class AuthMiddleware implements Middleware
{
    public function handle(): void
    {
        if (AuthService::currentUser() === null) {
            throw new HttpException(401, 'Authentication required');
        }
    }
}
