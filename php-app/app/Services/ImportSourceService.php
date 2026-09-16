<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Validation;
use App\Repositories\ImportSourceRepository;
use App\Services\Import\ColumnMapper;

final class ImportSourceService
{
    public function __construct(private readonly ImportSourceRepository $repo = new ImportSourceRepository())
    {
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>, id?: string} */
    public function create(array $input, string $actorId): array
    {
        $errors = Validation::validate($input, [
            'source_type' => 'required|in:bank_expense,revenue',
            'name' => 'required|max:255',
        ]);

        $columnMappingJson = $this->normalizeColumnMapping($input, $errors);
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $id = $this->repo->create([
            'source_type' => $input['source_type'],
            'name' => trim((string) $input['name']),
            'entity_id' => $input['entity_id'] !== '' ? $input['entity_id'] : null,
            'column_mapping' => $columnMappingJson,
            'is_active' => (bool) $input['is_active'],
        ]);

        AuditService::log($actorId, 'import_source_created', 'import_sources', $id, null, [
            'source_type' => $input['source_type'], 'name' => $input['name'],
        ]);

        return ['ok' => true, 'errors' => [], 'id' => $id];
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>} */
    public function update(string $id, array $input, string $actorId): array
    {
        $before = $this->repo->findById($id);
        if ($before === null) {
            return ['ok' => false, 'errors' => ['id' => 'Sumber data tidak ditemukan.']];
        }

        $errors = Validation::validate($input, [
            'source_type' => 'required|in:bank_expense,revenue',
            'name' => 'required|max:255',
        ]);

        $columnMappingJson = $this->normalizeColumnMapping($input, $errors);
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $this->repo->update($id, [
            'source_type' => $input['source_type'],
            'name' => trim((string) $input['name']),
            'entity_id' => $input['entity_id'] !== '' ? $input['entity_id'] : null,
            'column_mapping' => $columnMappingJson,
            'is_active' => (bool) $input['is_active'],
        ]);

        AuditService::log($actorId, 'import_source_updated', 'import_sources', $id, $before, [
            'source_type' => $input['source_type'], 'name' => $input['name'],
        ]);

        return ['ok' => true, 'errors' => []];
    }

    /**
     * A blank column_mapping textarea means "use the default
     * synonym-based detection" (spec O) - only a non-blank value is
     * parsed and validated, never silently accepted as-is: every field
     * name must be one ColumnMapper actually recognizes for the chosen
     * source_type, and every value must be a column index or null,
     * otherwise a saved source could someday feed BankImportPipeline a
     * mapping that silently omits a required field.
     *
     * @param array<string, mixed> $input
     * @param array<string, string> $errors
     */
    private function normalizeColumnMapping(array $input, array &$errors): ?string
    {
        $raw = trim((string) ($input['column_mapping'] ?? ''));
        if ($raw === '') {
            return null;
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || json_last_error() !== JSON_ERROR_NONE) {
            $errors['column_mapping'] = 'Pemetaan kolom harus berupa JSON objek yang valid, contoh: {"bank": 0, "tanggal": 1}.';
            return null;
        }

        $sourceType = $input['source_type'] ?? null;
        $validFields = $sourceType === 'revenue' ? ColumnMapper::revenueRequiredFields() : ColumnMapper::bankExpenseRequiredFields();

        foreach ($decoded as $field => $value) {
            if (!in_array($field, $validFields, true)) {
                $errors['column_mapping'] = "Nama kolom '{$field}' tidak dikenali untuk tipe sumber ini.";
                return null;
            }
            if ($value !== null && !is_int($value)) {
                $errors['column_mapping'] = "Nilai untuk '{$field}' harus berupa angka indeks kolom atau null.";
                return null;
            }
        }

        return json_encode($decoded, JSON_UNESCAPED_UNICODE);
    }
}
