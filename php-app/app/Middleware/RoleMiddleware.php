<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\HttpException;
use App\Services\AuditService;
use App\Services\AuthService;

/**
 * Route-level role gate - construct with the roles allowed on this
 * route, e.g. `new RoleMiddleware(['accounting', 'finance_manager'])`.
 * Always listed AFTER AuthMiddleware in a route's middleware array (it
 * assumes a user is already known to exist; it answers "which role,"
 * not "is there a session at all").
 */
final class RoleMiddleware implements Middleware
{
    /** @param list<string> $allowedRoles */
    public function __construct(private readonly array $allowedRoles)
    {
    }

    public function handle(): void
    {
        $user = AuthService::currentUser();
        if ($user === null || !in_array($user['role'], $this->allowedRoles, true)) {
            if ($user !== null) {
                AuditService::log($user['id'], 'access_denied', 'route', null, null, [
                    'role' => $user['role'],
                    'allowed_roles' => $this->allowedRoles,
                ]);
            }
            throw new HttpException(403, 'Forbidden for this role');
        }
    }
}
