<?php

declare(strict_types=1);

namespace App\Policies;

use App\Helpers\HttpException;

/**
 * Action-level RBAC - "can this role do X at all." Direct successor to
 * the original TypeScript app's lib/supabase/permissions.ts WRITE_ROLES
 * map, which that file's own comment described as "UX-only, RLS is the
 * actual boundary." There is no RLS anymore, so this map graduates to
 * being the actual boundary - every Controller action that mutates or
 * reads sensitive data calls Policy::authorize() first, per
 * CPANEL_MYSQL_IMPLEMENTATION_PLAN.md's RBAC Architecture section.
 *
 * This does NOT replace row-level scoping (see Repositories, e.g.
 * ProfileRepository::findOwnProfileOnly()) - it only answers "may this
 * role attempt this action," never "which rows may it see."
 */
final class Policy
{
    /** @var array<string, list<string>> ability => allowed roles */
    private const ABILITIES = [
        // Phase 1 demo ability, exercised by tests/Feature.
        'demo.manage' => ['super_admin', 'accounting', 'finance_manager'],

        // Phase 2 Master Data - write access. Read access to every
        // master page is gated at the route level (RoleMiddleware,
        // staff-only, investor excluded entirely - see app/routes.php)
        // rather than per-ability, since every staff role may at least
        // view Master Data; these abilities are what additionally gate
        // create/edit/status-change. Mirrors the original TypeScript
        // app's lib/supabase/permissions.ts WRITE_ROLES map exactly:
        // banks/contracts/ownerships exclude `management`, the rest
        // include it.
        'master.entities.write' => ['super_admin', 'accounting', 'finance_manager', 'management'],
        'master.outlets.write' => ['super_admin', 'accounting', 'finance_manager', 'management'],
        'master.coa.write' => ['super_admin', 'accounting', 'finance_manager', 'management'],
        'master.investors.write' => ['super_admin', 'accounting', 'finance_manager', 'management'],
        'master.banks.write' => ['super_admin', 'accounting', 'finance_manager'],
        'master.contracts.write' => ['super_admin', 'accounting', 'finance_manager'],
        'master.ownerships.write' => ['super_admin', 'accounting', 'finance_manager'],
    ];

    public static function can(?array $user, string $ability): bool
    {
        if ($user === null) {
            return false;
        }
        $allowedRoles = self::ABILITIES[$ability] ?? [];
        return in_array($user['role'], $allowedRoles, true);
    }

    /** @throws HttpException 403 if the current role cannot perform $ability */
    public static function authorize(?array $user, string $ability): void
    {
        if (!self::can($user, $ability)) {
            throw new HttpException(403, "Role is not authorized for: {$ability}");
        }
    }
}
