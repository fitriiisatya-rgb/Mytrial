<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Helpers\Uuid;

/**
 * spec O: a named, reusable upload source ("Buku Bank BCA Operasional",
 * "Revenue Outlet Bekasi") that pins a source_type + an optional saved
 * column_mapping - so a recurring upload with non-default header labels
 * doesn't need manual header-row/column selection every time. Entirely
 * optional: an ad-hoc upload with no selected source still works using
 * the default synonym-based mapping (see ColumnMapper).
 */
final class ImportSourceRepository
{
    /** @return list<array<string, mixed>> */
    public function paginate(Paginator $paginator, ?string $sourceType, ?string $search): array
    {
        [$where, $params] = $this->buildWhere($sourceType, $search);
        $stmt = Connection::instance()->prepare(
            "SELECT s.*, e.name AS entity_name FROM import_sources s
             LEFT JOIN entities e ON e.id = s.entity_id
             {$where} ORDER BY s.name ASC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $paginator->perPage, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function count(?string $sourceType, ?string $search): int
    {
        [$where, $params] = $this->buildWhere($sourceType, $search);
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM import_sources s {$where}");
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function buildWhere(?string $sourceType, ?string $search): array
    {
        $conditions = [];
        $params = [];
        if ($sourceType !== null && $sourceType !== '') {
            $conditions[] = 's.source_type = :source_type';
            $params[':source_type'] = $sourceType;
        }
        if ($search !== null && $search !== '') {
            $conditions[] = 's.name LIKE :search_name';
            $params[':search_name'] = '%' . $search . '%';
        }
        $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
        return [$where, $params];
    }

    public function findById(string $id): ?array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT s.*, e.name AS entity_name FROM import_sources s LEFT JOIN entities e ON e.id = s.entity_id WHERE s.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string, mixed>> active sources of one type, for the upload form's "use a saved source" dropdown. */
    public function listActiveByType(string $sourceType): array
    {
        $stmt = Connection::instance()->prepare(
            "SELECT id, name, column_mapping FROM import_sources WHERE source_type = :source_type AND is_active = 1 ORDER BY name ASC"
        );
        $stmt->execute(['source_type' => $sourceType]);
        return $stmt->fetchAll();
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): string
    {
        $id = Uuid::v4();
        $stmt = Connection::instance()->prepare(
            'INSERT INTO import_sources (id, source_type, name, entity_id, column_mapping, is_active)
             VALUES (:id, :source_type, :name, :entity_id, :column_mapping, :is_active)'
        );
        $stmt->execute([
            'id' => $id,
            'source_type' => $data['source_type'],
            'name' => $data['name'],
            'entity_id' => $data['entity_id'],
            'column_mapping' => $data['column_mapping'],
            'is_active' => $data['is_active'] ? 1 : 0,
        ]);
        return $id;
    }

    /** @param array<string, mixed> $data */
    public function update(string $id, array $data): void
    {
        $stmt = Connection::instance()->prepare(
            'UPDATE import_sources SET source_type = :source_type, name = :name, entity_id = :entity_id,
               column_mapping = :column_mapping, is_active = :is_active
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'source_type' => $data['source_type'],
            'name' => $data['name'],
            'entity_id' => $data['entity_id'],
            'column_mapping' => $data['column_mapping'],
            'is_active' => $data['is_active'] ? 1 : 0,
        ]);
    }
}
