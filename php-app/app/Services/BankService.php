<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Validation;
use App\Repositories\BankRepository;

final class BankService
{
    public function __construct(private readonly BankRepository $repo = new BankRepository())
    {
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>, id?: string} */
    public function create(array $input, string $actorId): array
    {
        $errors = $this->validate($input, null);
        if ($errors === [] && $this->repo->findByNameAndAccount(trim((string) $input['bank_name']), trim((string) $input['account_number'])) !== null) {
            $errors['account_number'] = 'Kombinasi nama bank + nomor rekening sudah terdaftar.';
        }
        if ($errors === []) {
            $existingBank = $this->repo->findByCoaId((string) $input['coa_id']);
            if ($existingBank !== null) {
                $errors['coa_id'] = 'COA ini sudah dipakai rekening bank lain - setiap rekening wajib punya COA sendiri.';
            }
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $data = $this->normalize($input);
        $id = $this->repo->create($data);
        AuditService::log($actorId, 'bank_created', 'banks', $id, null, $data);

        return ['ok' => true, 'errors' => [], 'id' => $id];
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>} */
    public function update(string $id, array $input, string $actorId): array
    {
        $before = $this->repo->findById($id);
        if ($before === null) {
            return ['ok' => false, 'errors' => ['id' => 'Rekening bank tidak ditemukan.']];
        }

        $errors = $this->validate($input, $id);
        if ($errors === []) {
            $existing = $this->repo->findByNameAndAccount(trim((string) $input['bank_name']), trim((string) $input['account_number']));
            if ($existing !== null && $existing['id'] !== $id) {
                $errors['account_number'] = 'Kombinasi nama bank + nomor rekening sudah terdaftar.';
            }
        }
        if ($errors === []) {
            $existingBank = $this->repo->findByCoaId((string) $input['coa_id']);
            if ($existingBank !== null && $existingBank['id'] !== $id) {
                $errors['coa_id'] = 'COA ini sudah dipakai rekening bank lain - setiap rekening wajib punya COA sendiri.';
            }
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $data = $this->normalize($input);
        $this->repo->update($id, $data);
        AuditService::log($actorId, 'bank_updated', 'banks', $id, $before, $data);

        return ['ok' => true, 'errors' => []];
    }

    /** @param array<string, mixed> $input @return array<string, string> */
    private function validate(array $input, ?string $id): array
    {
        return Validation::validate($input, [
            'entity_id' => 'required',
            'bank_name' => 'required|max:255',
            'account_number' => 'required|max:100',
            'account_name' => 'required|max:255',
            // spec E: COA is mandatory, never optional/generic.
            'coa_id' => 'required',
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    private function normalize(array $input): array
    {
        return [
            'entity_id' => $input['entity_id'],
            'bank_name' => trim((string) $input['bank_name']),
            'account_number' => trim((string) $input['account_number']),
            'account_name' => trim((string) $input['account_name']),
            'coa_id' => $input['coa_id'],
            'is_active' => !empty($input['is_active']),
        ];
    }
}
