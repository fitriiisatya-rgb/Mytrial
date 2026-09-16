<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Policies\Policy;
use App\Repositories\ProfileRepository;

/**
 * Phase 1 has no real business module yet (those start Phase 2) - this
 * Controller exists purely to give the RBAC/row-scoping architecture a
 * concrete route to exercise, satisfying the Phase 1 test list items
 * "role permission allow/deny works", "repository row scope works",
 * and "investor cannot access internal route". A later phase's real
 * Controllers (EntityController, JournalController, ...) follow this
 * exact same shape: AuthMiddleware + RoleMiddleware on the route,
 * Policy::authorize() for any finer per-action check, a Repository
 * method for every read/write.
 */
final class DemoController extends Controller
{
    /** GET /demo/internal - staff-only (super_admin/accounting/finance_manager/management), never investor. RoleMiddleware on the route already enforces this; reaching here means it passed. */
    public function internal(): void
    {
        $this->json(['ok' => true, 'message' => 'internal staff route reached']);
    }

    /** GET /demo/profile - any authenticated user, but the Repository call can only ever return the caller's OWN row - row-level scoping by construction, not by a Controller-level `if`. */
    public function profile(): void
    {
        $user = $this->currentUser();
        $repo = new ProfileRepository();
        $own = $repo->findOwnProfileOnly($user['id']);
        $this->json(['ok' => true, 'profile' => $own]);
    }

    /** GET /demo/manage - action-level Policy check (finer-grained than a route-level RoleMiddleware; demonstrates the pattern every later Controller reuses). */
    public function manage(): void
    {
        Policy::authorize($this->currentUser(), 'demo.manage');
        $this->json(['ok' => true, 'message' => 'manage ability granted']);
    }
}
