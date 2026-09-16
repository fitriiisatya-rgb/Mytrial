<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Helpers\Uuid;

final class CoaRepository
{
    /** @return list<array<string, mixed>> */
    public function paginate(Paginator $paginator, ?string $search, ?string $accountType, ?string $activeFilter): array
    {
        [$where, $params] = $this->buildWhere($search, $accountType, $activeFilter);
        $stmt = Connection::instance()->prepare(
            "SELECT c.*, p.name AS parent_name FROM coa c
             LEFT JOIN coa p ON p.id = c.parent_id
             {$where} ORDER BY c.code ASC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $paginator->perPage, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function count(?string $search, ?string $accountType, ?string $activeFilter): int
    {
        [$where, $params] = $this->buildWhere($search, $accountType, $activeFilter);
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM coa c {$where}");
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function buildWhere(?string $search, ?string $accountType, ?string $activeFilter): array
    {
        $conditions = [];
        $params = [];
        if ($search !== null && $search !== '') {
            // Distinct placeholder per LIKE, same value - see
            // EntityRepository::buildWhere() for why.
            $conditions[] = '(c.code LIKE :search_code OR c.name LIKE :search_name)';
            $params[':search_code'] = '%' . $search . '%';
            $params[':search_name'] = '%' . $search . '%';
        }
        if ($accountType !== null && $accountType !== '') {
            $conditions[] = 'c.account_type = :account_type';
            $params[':account_type'] = $accountType;
        }
        if ($activeFilter === 'active') {
            $conditions[] = 'c.is_active = 1';
        } elseif ($activeFilter === 'inactive') {
            $conditions[] = 'c.is_active = 0';
        }
        $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
        return [$where, $params];
    }

    public function findById(string $id): ?array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT c.*, p.name AS parent_name FROM coa c LEFT JOIN coa p ON p.id = c.parent_id WHERE c.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findByCode(string $code): ?array
    {
        $stmt = Connection::instance()->prepare('SELECT * FROM coa WHERE code = :code LIMIT 1');
        $stmt->execute(['code' => $code]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string, mixed>> every COA account, for hierarchy display and parent dropdowns */
    public function listAll(): array
    {
        $stmt = Connection::instance()->query('SELECT * FROM coa ORDER BY code ASC');
        return $stmt->fetchAll();
    }

    /**
     * Active asset accounts not already claimed by another bank - the
     * dropdown source for a bank account's COA (spec E: every bank must
     * have its OWN dedicated COA, never a generic shared one; the
     * `uq_banks_coa_id` unique index is the real enforcement, this is
     * just what keeps the picker from offering an already-taken option
     * in the first place). $currentCoaId (the bank's own COA when
     * editing) is always included even though it's technically "taken" -
     * by itself, not by a different bank.
     *
     * @return list<array<string, mixed>>
     */
    public function listAvailableForBank(?string $currentCoaId = null): array
    {
        $stmt = Connection::instance()->prepare(
            "SELECT c.* FROM coa c
             WHERE c.account_type = 'asset' AND c.is_active = 1
               AND (c.id NOT IN (SELECT coa_id FROM banks) OR c.id = :current_coa_id)
             ORDER BY c.code ASC"
        );
        $stmt->execute(['current_coa_id' => $currentCoaId ?? '']);
        return $stmt->fetchAll();
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): string
    {
        $id = Uuid::v4();
        $stmt = Connection::instance()->prepare(
            'INSERT INTO coa (id, code, name, account_type, parent_id, normal_balance, pnl_category, reporting_order, is_active)
             VALUES (:id, :code, :name, :account_type, :parent_id, :normal_balance, :pnl_category, :reporting_order, :is_active)'
        );
        $stmt->execute([
            'id' => $id,
            'code' => $data['code'],
            'name' => $data['name'],
            'account_type' => $data['account_type'],
            'parent_id' => $data['parent_id'] !== '' ? $data['parent_id'] : null,
            'normal_balance' => $data['normal_balance'],
            'pnl_category' => $data['pnl_category'] !== '' ? $data['pnl_category'] : null,
            'reporting_order' => (int) $data['reporting_order'],
            'is_active' => $data['is_active'] ? 1 : 0,
        ]);
        return $id;
    }

    /** @param array<string, mixed> $data */
    public function update(string $id, array $data): void
    {
        $stmt = Connection::instance()->prepare(
            'UPDATE coa SET code = :code, name = :name, account_type = :account_type, parent_id = :parent_id,
               normal_balance = :normal_balance, pnl_category = :pnl_category, reporting_order = :reporting_order, is_active = :is_active
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'code' => $data['code'],
            'name' => $data['name'],
            'account_type' => $data['account_type'],
            'parent_id' => $data['parent_id'] !== '' ? $data['parent_id'] : null,
            'normal_balance' => $data['normal_balance'],
            'pnl_category' => $data['pnl_category'] !== '' ? $data['pnl_category'] : null,
            'reporting_order' => (int) $data['reporting_order'],
            'is_active' => $data['is_active'] ? 1 : 0,
        ]);
    }

    /**
     * True if making $candidateParentId the parent of $id would create a
     * cycle (spec D: "prevent circular hierarchy") - walks the ancestor
     * chain of $candidateParentId looking for $id, bounded by a hop
     * limit rather than trusting the data can never already be
     * corrupted into a loop some other way.
     */
    public function wouldCreateCycle(string $id, string $candidateParentId): bool
    {
        if ($id === $candidateParentId) {
            return true;
        }
        $current = $candidateParentId;
        $pdo = Connection::instance();
        for ($hops = 0; $hops < 100; $hops++) {
            $stmt = $pdo->prepare('SELECT parent_id FROM coa WHERE id = :id LIMIT 1');
            $stmt->execute(['id' => $current]);
            $row = $stmt->fetch();
            if ($row === false || $row['parent_id'] === null) {
                return false;
            }
            if ($row['parent_id'] === $id) {
                return true;
            }
            $current = $row['parent_id'];
        }
        return true; // 100+ hops is itself a sign of a corrupt chain - refuse rather than loop forever.
    }
}
