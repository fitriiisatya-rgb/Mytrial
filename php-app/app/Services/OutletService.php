<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Validation;
use App\Repositories\OutletRepository;

final class OutletService
{
    public function __construct(private readonly OutletRepository $repo = new OutletRepository())
    {
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>, id?: string} */
    public function create(array $input, string $actorId): array
    {
        $errors = $this->validate($input);
        if ($errors === [] && $this->repo->findByCode(trim((string) $input['code'])) !== null) {
            $errors['code'] = 'Kode outlet sudah digunakan.';
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $input['code'] = trim((string) $input['code']);
        $input['name'] = trim((string) $input['name']);
        $id = $this->repo->create($input);
        AuditService::log($actorId, 'outlet_created', 'outlets', $id, null, $input);

        return ['ok' => true, 'errors' => [], 'id' => $id];
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>} */
    public function update(string $id, array $input, string $actorId): array
    {
        $before = $this->repo->findById($id);
        if ($before === null) {
            return ['ok' => false, 'errors' => ['id' => 'Outlet tidak ditemukan.']];
        }

        $errors = $this->validate($input);
        if ($errors === []) {
            $existing = $this->repo->findByCode(trim((string) $input['code']));
            if ($existing !== null && $existing['id'] !== $id) {
                $errors['code'] = 'Kode outlet sudah digunakan.';
            }
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $input['code'] = trim((string) $input['code']);
        $input['name'] = trim((string) $input['name']);
        $this->repo->update($id, $input);
        AuditService::log($actorId, 'outlet_updated', 'outlets', $id, $before, $input);

        return ['ok' => true, 'errors' => []];
    }

    /** @param array<string, mixed> $input @return array<string, string> */
    private function validate(array $input): array
    {
        return Validation::validate($input, [
            'entity_id' => 'required',
            'code' => 'required|max:50',
            'name' => 'required|max:255',
            'status' => 'required|in:active,inactive',
        ]);
    }

    /**
     * spec C's ownership indicator: 100% exactly = valid, <100% = warning
     * (partially owned, not necessarily wrong), >100% = invalid (should
     * never happen given the create-time guard, but the indicator must
     * still detect it rather than assume the guard is infallible).
     */
    public static function ownershipIndicator(float $totalPct): string
    {
        if (abs($totalPct - 100.0) < 0.0001) {
            return 'valid';
        }
        return $totalPct > 100.0 ? 'invalid' : 'warning';
    }
}
