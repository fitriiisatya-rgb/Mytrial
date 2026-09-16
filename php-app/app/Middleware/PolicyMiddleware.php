<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Policies\Policy;
use App\Services\AuthService;

/**
 * Route-level action ability gate - construct with the Policy ability
 * string this route requires, e.g. `new PolicyMiddleware('master.banks.write')`.
 * Functionally identical to calling Policy::authorize() at the top of
 * every Controller action (throws the same 403 before any Controller
 * code runs) but centralizes it at the route declaration in
 * app/routes.php, where every write route's required ability is visible
 * in one place - a new action can never "forget" the check the way a
 * per-method call could be omitted by accident.
 */
final class PolicyMiddleware implements Middleware
{
    public function __construct(private readonly string $ability)
    {
    }

    public function handle(): void
    {
        Policy::authorize(AuthService::currentUser(), $this->ability);
    }
}
