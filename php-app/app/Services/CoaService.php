<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Validation;
use App\Repositories\CoaRepository;

final class CoaService
{
    private const ACCOUNT_TYPES = 'asset,liability,equity,revenue,expense';
    private const PNL_CATEGORIES = 'revenue,cogs,opex,other_income,other_expense';

    public function __construct(private readonly CoaRepository $repo = new CoaRepository())
    {
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>, id?: string} */
    public function create(array $input, string $actorId): array
    {
        $errors = $this->validate($input, null);
        if ($errors === [] && $this->repo->findByCode(trim((string) $input['code'])) !== null) {
            $errors['code'] = 'Kode COA sudah digunakan.';
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $data = $this->normalize($input);
        $id = $this->repo->create($data);
        AuditService::log($actorId, 'coa_created', 'coa', $id, null, $data);

        return ['ok' => true, 'errors' => [], 'id' => $id];
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>} */
    public function update(string $id, array $input, string $actorId): array
    {
        $before = $this->repo->findById($id);
        if ($before === null) {
            return ['ok' => false, 'errors' => ['id' => 'Akun COA tidak ditemukan.']];
        }

        $errors = $this->validate($input, $id);
        if ($errors === []) {
            $existing = $this->repo->findByCode(trim((string) $input['code']));
            if ($existing !== null && $existing['id'] !== $id) {
                $errors['code'] = 'Kode COA sudah digunakan.';
            }
        }
        $parentId = trim((string) ($input['parent_id'] ?? ''));
        if ($errors === [] && $parentId !== '' && $this->repo->wouldCreateCycle($id, $parentId)) {
            $errors['parent_id'] = 'Parent tidak boleh membuat hierarki melingkar (circular).';
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $data = $this->normalize($input);
        $this->repo->update($id, $data);
        AuditService::log($actorId, 'coa_updated', 'coa', $id, $before, $data);

        return ['ok' => true, 'errors' => []];
    }

    /** @param array<string, mixed> $input @return array<string, string> */
    private function validate(array $input, ?string $id): array
    {
        $errors = Validation::validate($input, [
            'code' => 'required|max:50',
            'name' => 'required|max:255',
            'account_type' => 'required|in:' . self::ACCOUNT_TYPES,
            'normal_balance' => 'required|in:debit,credit',
        ]);

        $pnlCategory = trim((string) ($input['pnl_category'] ?? ''));
        if ($pnlCategory !== '' && !in_array($pnlCategory, explode(',', self::PNL_CATEGORIES), true)) {
            $errors['pnl_category'] = 'Kategori P&L tidak valid.';
        }

        $parentId = trim((string) ($input['parent_id'] ?? ''));
        if ($parentId !== '' && $id !== null && $parentId === $id) {
            $errors['parent_id'] = 'Akun tidak boleh menjadi parent dari dirinya sendiri.';
        }

        return $errors;
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    private function normalize(array $input): array
    {
        return [
            'code' => trim((string) $input['code']),
            'name' => trim((string) $input['name']),
            'account_type' => $input['account_type'],
            'parent_id' => trim((string) ($input['parent_id'] ?? '')),
            'normal_balance' => $input['normal_balance'],
            'pnl_category' => trim((string) ($input['pnl_category'] ?? '')),
            'reporting_order' => $input['reporting_order'] !== '' ? $input['reporting_order'] : 0,
            'is_active' => !empty($input['is_active']),
        ];
    }
}
