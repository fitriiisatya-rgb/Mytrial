<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Helpers\Uuid;

final class OutletRepository
{
    /** @return list<array<string, mixed>> */
    public function paginate(Paginator $paginator, ?string $search, ?string $status, ?string $entityId): array
    {
        [$where, $params] = $this->buildWhere($search, $status, $entityId);
        $stmt = Connection::instance()->prepare(
            "SELECT o.*, e.name AS entity_name FROM outlets o
             JOIN entities e ON e.id = o.entity_id
             {$where} ORDER BY o.name ASC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $paginator->perPage, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function count(?string $search, ?string $status, ?string $entityId): int
    {
        [$where, $params] = $this->buildWhere($search, $status, $entityId);
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM outlets o {$where}");
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function buildWhere(?string $search, ?string $status, ?string $entityId): array
    {
        $conditions = [];
        $params = [];
        if ($search !== null && $search !== '') {
            // Distinct placeholder per LIKE, same value - see
            // EntityRepository::buildWhere() for why.
            $conditions[] = '(o.code LIKE :search_code OR o.name LIKE :search_name)';
            $params[':search_code'] = '%' . $search . '%';
            $params[':search_name'] = '%' . $search . '%';
        }
        if ($status !== null && $status !== '') {
            $conditions[] = 'o.status = :status';
            $params[':status'] = $status;
        }
        if ($entityId !== null && $entityId !== '') {
            $conditions[] = 'o.entity_id = :entity_id';
            $params[':entity_id'] = $entityId;
        }
        $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
        return [$where, $params];
    }

    public function findById(string $id): ?array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT o.*, e.name AS entity_name FROM outlets o JOIN entities e ON e.id = o.entity_id WHERE o.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findByCode(string $code): ?array
    {
        $stmt = Connection::instance()->prepare('SELECT * FROM outlets WHERE code = :code LIMIT 1');
        $stmt->execute(['code' => $code]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): string
    {
        $id = Uuid::v4();
        $stmt = Connection::instance()->prepare(
            'INSERT INTO outlets (id, entity_id, code, name, area, address, opening_date, partnership_start, partnership_end, status)
             VALUES (:id, :entity_id, :code, :name, :area, :address, :opening_date, :partnership_start, :partnership_end, :status)'
        );
        $stmt->execute([
            'id' => $id,
            'entity_id' => $data['entity_id'],
            'code' => $data['code'],
            'name' => $data['name'],
            'area' => $data['area'] !== '' ? $data['area'] : null,
            'address' => $data['address'] !== '' ? $data['address'] : null,
            'opening_date' => $data['opening_date'] !== '' ? $data['opening_date'] : null,
            'partnership_start' => $data['partnership_start'] !== '' ? $data['partnership_start'] : null,
            'partnership_end' => $data['partnership_end'] !== '' ? $data['partnership_end'] : null,
            'status' => $data['status'],
        ]);
        return $id;
    }

    /** @param array<string, mixed> $data */
    public function update(string $id, array $data): void
    {
        $stmt = Connection::instance()->prepare(
            'UPDATE outlets SET entity_id = :entity_id, code = :code, name = :name, area = :area, address = :address,
               opening_date = :opening_date, partnership_start = :partnership_start, partnership_end = :partnership_end, status = :status
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'entity_id' => $data['entity_id'],
            'code' => $data['code'],
            'name' => $data['name'],
            'area' => $data['area'] !== '' ? $data['area'] : null,
            'address' => $data['address'] !== '' ? $data['address'] : null,
            'opening_date' => $data['opening_date'] !== '' ? $data['opening_date'] : null,
            'partnership_start' => $data['partnership_start'] !== '' ? $data['partnership_start'] : null,
            'partnership_end' => $data['partnership_end'] !== '' ? $data['partnership_end'] : null,
            'status' => $data['status'],
        ]);
    }

    /** @return list<array<string, mixed>> every active outlet, for select dropdowns */
    public function listActive(): array
    {
        $stmt = Connection::instance()->query("SELECT id, code, name FROM outlets WHERE status = 'active' ORDER BY name ASC");
        return $stmt->fetchAll();
    }
}
