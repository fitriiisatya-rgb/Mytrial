<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Helpers\Uuid;

final class BankRepository
{
    /** @return list<array<string, mixed>> */
    public function paginate(Paginator $paginator, ?string $search, ?string $activeFilter, ?string $entityId): array
    {
        [$where, $params] = $this->buildWhere($search, $activeFilter, $entityId);
        $stmt = Connection::instance()->prepare(
            "SELECT b.*, e.name AS entity_name, c.code AS coa_code, c.name AS coa_name FROM banks b
             JOIN entities e ON e.id = b.entity_id
             JOIN coa c ON c.id = b.coa_id
             {$where} ORDER BY b.bank_name ASC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $paginator->perPage, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function count(?string $search, ?string $activeFilter, ?string $entityId): int
    {
        [$where, $params] = $this->buildWhere($search, $activeFilter, $entityId);
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM banks b {$where}");
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function buildWhere(?string $search, ?string $activeFilter, ?string $entityId): array
    {
        $conditions = [];
        $params = [];
        if ($search !== null && $search !== '') {
            // Distinct placeholder per LIKE, same value - see
            // EntityRepository::buildWhere() for why.
            $conditions[] = '(b.bank_name LIKE :search_bank OR b.account_number LIKE :search_number OR b.account_name LIKE :search_name)';
            $params[':search_bank'] = '%' . $search . '%';
            $params[':search_number'] = '%' . $search . '%';
            $params[':search_name'] = '%' . $search . '%';
        }
        if ($activeFilter === 'active') {
            $conditions[] = 'b.is_active = 1';
        } elseif ($activeFilter === 'inactive') {
            $conditions[] = 'b.is_active = 0';
        }
        if ($entityId !== null && $entityId !== '') {
            $conditions[] = 'b.entity_id = :entity_id';
            $params[':entity_id'] = $entityId;
        }
        $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
        return [$where, $params];
    }

    public function findById(string $id): ?array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT b.*, e.name AS entity_name, c.code AS coa_code, c.name AS coa_name FROM banks b
             JOIN entities e ON e.id = b.entity_id
             JOIN coa c ON c.id = b.coa_id
             WHERE b.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findByNameAndAccount(string $bankName, string $accountNumber): ?array
    {
        $stmt = Connection::instance()->prepare('SELECT * FROM banks WHERE bank_name = :bank_name AND account_number = :account_number LIMIT 1');
        $stmt->execute(['bank_name' => $bankName, 'account_number' => $accountNumber]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** The bank (if any) that already uses $coaId - COA must be bank-specific, never shared (spec E). */
    /** @return list<array{id: string, bank_name: string}> active banks, for BankMatcher during import - never matches against a deactivated account. */
    public function listActiveForMatching(): array
    {
        $stmt = Connection::instance()->query('SELECT id, bank_name FROM banks WHERE is_active = 1');
        return $stmt->fetchAll();
    }

    public function findByCoaId(string $coaId): ?array
    {
        $stmt = Connection::instance()->prepare('SELECT * FROM banks WHERE coa_id = :coa_id LIMIT 1');
        $stmt->execute(['coa_id' => $coaId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): string
    {
        $id = Uuid::v4();
        $stmt = Connection::instance()->prepare(
            'INSERT INTO banks (id, entity_id, bank_name, account_number, account_name, coa_id, is_active)
             VALUES (:id, :entity_id, :bank_name, :account_number, :account_name, :coa_id, :is_active)'
        );
        $stmt->execute([
            'id' => $id,
            'entity_id' => $data['entity_id'],
            'bank_name' => $data['bank_name'],
            'account_number' => $data['account_number'],
            'account_name' => $data['account_name'],
            'coa_id' => $data['coa_id'],
            'is_active' => $data['is_active'] ? 1 : 0,
        ]);
        return $id;
    }

    /** @param array<string, mixed> $data */
    public function update(string $id, array $data): void
    {
        $stmt = Connection::instance()->prepare(
            'UPDATE banks SET entity_id = :entity_id, bank_name = :bank_name, account_number = :account_number,
               account_name = :account_name, coa_id = :coa_id, is_active = :is_active
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'entity_id' => $data['entity_id'],
            'bank_name' => $data['bank_name'],
            'account_number' => $data['account_number'],
            'account_name' => $data['account_name'],
            'coa_id' => $data['coa_id'],
            'is_active' => $data['is_active'] ? 1 : 0,
        ]);
    }
}
