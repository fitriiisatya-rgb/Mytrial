<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Helpers\Uuid;

final class EntityRepository
{
    /** @return list<array<string, mixed>> */
    public function paginate(Paginator $paginator, ?string $search, ?string $status): array
    {
        [$where, $params] = $this->buildWhere($search, $status);
        $stmt = Connection::instance()->prepare(
            "SELECT * FROM entities {$where} ORDER BY name ASC LIMIT :limit OFFSET :offset"
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
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM entities {$where}");
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return array{where: string, params: array<string, mixed>} */
    private function buildWhere(?string $search, ?string $status): array
    {
        $conditions = [];
        $params = [];
        if ($search !== null && $search !== '') {
            // Each LIKE gets its own placeholder bound to the identical
            // value - PDO with ATTR_EMULATE_PREPARES=false (real
            // server-side MySQL prepares) rejects a repeated named
            // placeholder within one query (see OwnershipRepository's
            // CURRENT_SQL for the same fix, discovered first there).
            $conditions[] = '(code LIKE :search_code OR name LIKE :search_name)';
            $params[':search_code'] = '%' . $search . '%';
            $params[':search_name'] = '%' . $search . '%';
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
        $stmt = Connection::instance()->prepare('SELECT * FROM entities WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findByCode(string $code): ?array
    {
        $stmt = Connection::instance()->prepare('SELECT * FROM entities WHERE code = :code LIMIT 1');
        $stmt->execute(['code' => $code]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function create(string $code, string $name, string $status): string
    {
        $id = Uuid::v4();
        Connection::instance()
            ->prepare('INSERT INTO entities (id, code, name, status) VALUES (:id, :code, :name, :status)')
            ->execute(['id' => $id, 'code' => $code, 'name' => $name, 'status' => $status]);
        return $id;
    }

    public function update(string $id, string $code, string $name, string $status): void
    {
        Connection::instance()
            ->prepare('UPDATE entities SET code = :code, name = :name, status = :status WHERE id = :id')
            ->execute(['id' => $id, 'code' => $code, 'name' => $name, 'status' => $status]);
    }

    public function outletCount(string $entityId): int
    {
        $stmt = Connection::instance()->prepare('SELECT COUNT(*) AS c FROM outlets WHERE entity_id = :id');
        $stmt->execute(['id' => $entityId]);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    public function bankCount(string $entityId): int
    {
        $stmt = Connection::instance()->prepare('SELECT COUNT(*) AS c FROM banks WHERE entity_id = :id');
        $stmt->execute(['id' => $entityId]);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return list<array<string, mixed>> every active entity, for select dropdowns */
    public function listActive(): array
    {
        $stmt = Connection::instance()->query("SELECT id, code, name FROM entities WHERE status = 'active' ORDER BY name ASC");
        return $stmt->fetchAll();
    }
}
