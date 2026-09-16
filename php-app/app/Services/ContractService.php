<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Validation;
use App\Repositories\ContractRepository;

final class ContractService
{
    public function __construct(private readonly ContractRepository $repo = new ContractRepository())
    {
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>, id?: string} */
    public function create(array $input, string $actorId): array
    {
        $errors = $this->validate($input);
        if ($errors === [] && $this->repo->findByContractNumber(trim((string) $input['contract_number'])) !== null) {
            $errors['contract_number'] = 'Nomor kontrak sudah digunakan.';
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $data = $this->normalize($input);
        $id = $this->repo->create($data);
        AuditService::log($actorId, 'contract_created', 'partnership_contracts', $id, null, $data);

        return ['ok' => true, 'errors' => [], 'id' => $id];
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>} */
    public function update(string $id, array $input, string $actorId): array
    {
        $before = $this->repo->findById($id);
        if ($before === null) {
            return ['ok' => false, 'errors' => ['id' => 'Kontrak tidak ditemukan.']];
        }

        $errors = $this->validate($input);
        if ($errors === []) {
            $existing = $this->repo->findByContractNumber(trim((string) $input['contract_number']));
            if ($existing !== null && $existing['id'] !== $id) {
                $errors['contract_number'] = 'Nomor kontrak sudah digunakan.';
            }
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $data = $this->normalize($input);
        $this->repo->update($id, $data);
        AuditService::log($actorId, 'contract_updated', 'partnership_contracts', $id, $before, $data);

        return ['ok' => true, 'errors' => []];
    }

    /** @param array<string, mixed> $input @return array<string, string> */
    private function validate(array $input): array
    {
        $errors = Validation::validate($input, [
            'outlet_id' => 'required',
            'contract_number' => 'required|max:100',
            'start_date' => 'required',
            'end_date' => 'required',
            'total_investment' => 'required',
            'profit_distribution_pct' => 'required',
            'status' => 'required|in:active,inactive',
        ]);

        $start = (string) ($input['start_date'] ?? '');
        $end = (string) ($input['end_date'] ?? '');
        if ($start !== '' && $end !== '' && strtotime($end) <= strtotime($start)) {
            $errors['end_date'] = 'Tanggal akhir harus setelah tanggal mulai.';
        }

        $pct = $input['profit_distribution_pct'] ?? null;
        if ($pct !== null && $pct !== '' && (!is_numeric($pct) || (float) $pct < 0 || (float) $pct > 100)) {
            $errors['profit_distribution_pct'] = 'Persentase distribusi harus antara 0 dan 100.';
        }

        $investment = $input['total_investment'] ?? null;
        if ($investment !== null && $investment !== '' && (!is_numeric($investment) || (float) $investment < 0)) {
            $errors['total_investment'] = 'Total investasi tidak valid.';
        }

        return $errors;
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    private function normalize(array $input): array
    {
        return [
            'outlet_id' => $input['outlet_id'],
            'contract_number' => trim((string) $input['contract_number']),
            'start_date' => $input['start_date'],
            'end_date' => $input['end_date'],
            'duration_months' => trim((string) ($input['duration_months'] ?? '')),
            'total_investment' => $input['total_investment'],
            'profit_distribution_pct' => $input['profit_distribution_pct'],
            'status' => $input['status'],
        ];
    }
}
