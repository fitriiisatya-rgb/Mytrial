<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Validation;
use App\Repositories\EntityRepository;

/**
 * @phpstan-type EntityResult array{ok: bool, errors: array<string,string>, id?: string}
 */
final class EntityService
{
    public function __construct(private readonly EntityRepository $repo = new EntityRepository())
    {
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>, id?: string} */
    public function create(array $input, string $actorId): array
    {
        $errors = Validation::validate($input, [
            'code' => 'required|max:50',
            'name' => 'required|max:255',
            'status' => 'required|in:active,inactive',
        ]);

        $code = trim((string) ($input['code'] ?? ''));
        if ($errors === [] && $this->repo->findByCode($code) !== null) {
            $errors['code'] = 'Kode entitas sudah digunakan.';
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $id = $this->repo->create($code, trim((string) $input['name']), (string) $input['status']);
        AuditService::log($actorId, 'entity_created', 'entities', $id, null, [
            'code' => $code, 'name' => $input['name'], 'status' => $input['status'],
        ]);

        return ['ok' => true, 'errors' => [], 'id' => $id];
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>} */
    public function update(string $id, array $input, string $actorId): array
    {
        $before = $this->repo->findById($id);
        if ($before === null) {
            return ['ok' => false, 'errors' => ['id' => 'Entitas tidak ditemukan.']];
        }

        $errors = Validation::validate($input, [
            'code' => 'required|max:50',
            'name' => 'required|max:255',
            'status' => 'required|in:active,inactive',
        ]);

        $code = trim((string) ($input['code'] ?? ''));
        if ($errors === []) {
            $existing = $this->repo->findByCode($code);
            if ($existing !== null && $existing['id'] !== $id) {
                $errors['code'] = 'Kode entitas sudah digunakan.';
            }
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $this->repo->update($id, $code, trim((string) $input['name']), (string) $input['status']);
        AuditService::log($actorId, 'entity_updated', 'entities', $id, $before, [
            'code' => $code, 'name' => $input['name'], 'status' => $input['status'],
        ]);

        return ['ok' => true, 'errors' => []];
    }
}
