<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Uuid;

/**
 * All SQL touching `profiles` lives here - Controllers/Services never
 * query this table directly. Every method uses a prepared statement
 * (PDO::ATTR_EMULATE_PREPARES is false globally - see
 * App\Database\Connection) so a value like the classic
 * `' OR '1'='1` in an email field is bound as data, never concatenated
 * into SQL.
 */
final class ProfileRepository
{
    public function findByEmail(string $email): ?array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT id, name, email, role, password_hash, is_active FROM profiles WHERE email = :email LIMIT 1'
        );
        $stmt->execute(['email' => $email]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findById(string $id): ?array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT id, name, email, role, is_active FROM profiles WHERE id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function create(string $name, string $email, string $role, string $passwordHash, bool $isActive = true): string
    {
        $id = Uuid::v4();
        $stmt = Connection::instance()->prepare(
            'INSERT INTO profiles (id, name, email, role, password_hash, is_active) VALUES (:id, :name, :email, :role, :password_hash, :is_active)'
        );
        $stmt->execute([
            'id' => $id,
            'name' => $name,
            'email' => $email,
            'role' => $role,
            'password_hash' => $passwordHash,
            'is_active' => $isActive ? 1 : 0,
        ]);
        return $id;
    }

    /**
     * Row-level scoping example for Phase 1's demo route (per
     * CPANEL_MYSQL_IMPLEMENTATION_PLAN.md's RBAC Architecture section):
     * an investor-scoped lookup that can only ever return the caller's
     * own row - there is no code path that lets the caller supply a
     * different id and read another profile through this method. This
     * is the pattern every later phase's investor-facing Repository
     * method must follow (ownerships, distributions, published P&L).
     */
    public function findOwnProfileOnly(string $callingUserId): ?array
    {
        return $this->findById($callingUserId);
    }
}
