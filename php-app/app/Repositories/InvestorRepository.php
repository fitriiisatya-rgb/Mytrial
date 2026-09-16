<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Helpers\Uuid;

final class InvestorRepository
{
    /** @return list<array<string, mixed>> */
    public function paginate(Paginator $paginator, ?string $search, ?string $status): array
    {
        [$where, $params] = $this->buildWhere($search, $status);
        $stmt = Connection::instance()->prepare(
            "SELECT * FROM investors {$where} ORDER BY full_name ASC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $paginator->perPage, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function count(?string $search, ?string $status): int
    {
        [$where, $params] = $this->buildWhere($search, $status);
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM investors {$where}");
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function buildWhere(?string $search, ?string $status): array
    {
        $conditions = [];
        $params = [];
        if ($search !== null && $search !== '') {
            // Distinct placeholder per LIKE, same value - see
            // EntityRepository::buildWhere() for why.
            $conditions[] = '(code LIKE :search_code OR full_name LIKE :search_name OR email LIKE :search_email)';
            $params[':search_code'] = '%' . $search . '%';
            $params[':search_name'] = '%' . $search . '%';
            $params[':search_email'] = '%' . $search . '%';
        }
        if ($status !== null && $status !== '') {
            $conditions[] = 'status = :status';
            $params[':status'] = $status;
        }
        $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
        return [$where, $params];
    }

    public function findById(string $id): ?array
    {
        $stmt = Connection::instance()->prepare('SELECT * FROM investors WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findByCode(string $code): ?array
    {
        $stmt = Connection::instance()->prepare('SELECT * FROM investors WHERE code = :code LIMIT 1');
        $stmt->execute(['code' => $code]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string, mixed>> every active investor, for select dropdowns */
    public function listActive(): array
    {
        $stmt = Connection::instance()->query("SELECT id, code, full_name FROM investors WHERE status = 'active' ORDER BY full_name ASC");
        return $stmt->fetchAll();
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): string
    {
        $id = Uuid::v4();
        $stmt = Connection::instance()->prepare(
            'INSERT INTO investors (id, code, full_name, email, phone, profile_id, status)
             VALUES (:id, :code, :full_name, :email, :phone, :profile_id, :status)'
        );
        $stmt->execute([
            'id' => $id,
            'code' => $data['code'],
            'full_name' => $data['full_name'],
            'email' => $data['email'] !== '' ? $data['email'] : null,
            'phone' => $data['phone'] !== '' ? $data['phone'] : null,
            'profile_id' => $data['profile_id'] !== '' ? $data['profile_id'] : null,
            'status' => $data['status'],
        ]);
        return $id;
    }

    /** @param array<string, mixed> $data */
    public function update(string $id, array $data): void
    {
        $stmt = Connection::instance()->prepare(
            'UPDATE investors SET code = :code, full_name = :full_name, email = :email, phone = :phone, profile_id = :profile_id, status = :status
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'code' => $data['code'],
            'full_name' => $data['full_name'],
            'email' => $data['email'] !== '' ? $data['email'] : null,
            'phone' => $data['phone'] !== '' ? $data['phone'] : null,
            'profile_id' => $data['profile_id'] !== '' ? $data['profile_id'] : null,
            'status' => $data['status'],
        ]);
    }
}
