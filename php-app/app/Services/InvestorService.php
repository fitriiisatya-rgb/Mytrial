<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Validation;
use App\Repositories\InvestorRepository;
use App\Repositories\ProfileRepository;

final class InvestorService
{
    public function __construct(
        private readonly InvestorRepository $repo = new InvestorRepository(),
        private readonly ProfileRepository $profiles = new ProfileRepository()
    ) {
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>, id?: string} */
    public function create(array $input, string $actorId): array
    {
        $errors = $this->validate($input);
        if ($errors === [] && $this->repo->findByCode(trim((string) $input['code'])) !== null) {
            $errors['code'] = 'Kode investor sudah digunakan.';
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $data = $this->normalize($input);
        $id = $this->repo->create($data);
        AuditService::log($actorId, 'investor_created', 'investors', $id, null, $data);

        return ['ok' => true, 'errors' => [], 'id' => $id];
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>} */
    public function update(string $id, array $input, string $actorId): array
    {
        $before = $this->repo->findById($id);
        if ($before === null) {
            return ['ok' => false, 'errors' => ['id' => 'Investor tidak ditemukan.']];
        }

        $errors = $this->validate($input);
        if ($errors === []) {
            $existing = $this->repo->findByCode(trim((string) $input['code']));
            if ($existing !== null && $existing['id'] !== $id) {
                $errors['code'] = 'Kode investor sudah digunakan.';
            }
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $data = $this->normalize($input);
        $this->repo->update($id, $data);
        AuditService::log($actorId, 'investor_updated', 'investors', $id, $before, $data);

        return ['ok' => true, 'errors' => []];
    }

    /** @param array<string, mixed> $input @return array<string, string> */
    private function validate(array $input): array
    {
        $errors = Validation::validate($input, [
            'code' => 'required|max:50',
            'full_name' => 'required|max:255',
            'status' => 'required|in:active,inactive',
            'email' => 'email',
        ]);

        // spec F: profile_id is deliberately never required - an
        // investor is a valid business record on its own, with or
        // without a login account. If one IS supplied, it must at least
        // point at a real profile row.
        $profileId = trim((string) ($input['profile_id'] ?? ''));
        if ($profileId !== '' && $this->profiles->findById($profileId) === null) {
            $errors['profile_id'] = 'Akun login yang dipilih tidak ditemukan.';
        }

        return $errors;
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    private function normalize(array $input): array
    {
        return [
            'code' => trim((string) $input['code']),
            'full_name' => trim((string) $input['full_name']),
            'email' => trim((string) ($input['email'] ?? '')),
            'phone' => trim((string) ($input['phone'] ?? '')),
            'profile_id' => trim((string) ($input['profile_id'] ?? '')),
            'status' => $input['status'],
        ];
    }
}
