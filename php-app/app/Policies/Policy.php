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
        // Phase 1 demo ability, exercised by tests/Feature - later
        // phases add one entry per real action (e.g.
        // 'journal.approve' => ['finance_manager', 'super_admin']).
        'demo.manage' => ['super_admin', 'accounting', 'finance_manager'],
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
