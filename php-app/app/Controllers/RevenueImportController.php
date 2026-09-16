<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\EntityRepository;
use App\Repositories\ImportBatchRepository;
use App\Repositories\ImportSourceRepository;
use App\Services\Import\RevenueImportPipeline;
use App\Services\Import\UploadValidator;

/**
 * Upload -> Preview -> Confirm flow for Revenue import (spec S) - same
 * structure as BankExpenseImportController, deliberately kept as its
 * own Controller rather than a shared parameterized one: Revenue's
 * fields, validation ladder, and stats are different enough (no
 * debit/credit, no bank matching) that sharing would mean branching on
 * source_type throughout, which is harder to follow than two small,
 * parallel Controllers.
 */
final class RevenueImportController extends Controller
{
    public function form(): void
    {
        $this->viewWithLayout('import/revenue/upload', 'Import Pendapatan', 'import', [
            'entities' => (new EntityRepository())->listActive(),
            'sources' => (new ImportSourceRepository())->listActiveByType('revenue'),
            'error' => null,
        ]);
    }

    public function preview(): void
    {
        $entityId = $this->input('entity_id', '') ?: null;
        $sourceName = trim((string) $this->input('source_name', '')) ?: null;
        $importSourceId = $this->input('import_source_id', '') ?: null;
        $headerRowOverride = $this->input('header_row_number', '') !== '' ? (int) $this->input('header_row_number') : null;

        $resolved = $this->resolveUploadedFile();
        if (!$resolved['ok']) {
            $this->viewWithLayout('import/revenue/upload', 'Import Pendapatan', 'import', [
                'entities' => (new EntityRepository())->listActive(),
                'sources' => (new ImportSourceRepository())->listActiveByType('revenue'),
                'error' => $resolved['error'],
            ]);
            return;
        }

        ['token' => $token, 'extension' => $extension, 'path' => $path, 'originalFilename' => $originalFilename] = $resolved;

        $savedMapping = null;
        if ($importSourceId !== null) {
            $source = (new ImportSourceRepository())->findById($importSourceId);
            if ($source !== null && $source['column_mapping'] !== null) {
                $savedMapping = json_decode((string) $source['column_mapping'], true);
            }
            if ($source !== null && $sourceName === null) {
                $sourceName = $source['name'];
            }
        }

        $analysis = (new RevenueImportPipeline())->analyze($path, $headerRowOverride, $savedMapping);

        $context = [
            'token' => $token,
            'extension' => $extension,
            'originalFilename' => $originalFilename,
            'entityId' => $entityId,
            'sourceName' => $sourceName,
            'importSourceId' => $importSourceId,
        ];

        if (!$analysis['ok']) {
            if (($analysis['needsManualHeaderRow'] ?? false) === true || isset($analysis['previewRows'])) {
                $this->viewWithLayout('import/revenue/select-header', 'Pilih Baris Header', 'import', $context + [
                    'error' => $analysis['error'],
                    'previewRows' => $analysis['previewRows'] ?? [],
                    'currentHeaderRow' => $headerRowOverride,
                ]);
                return;
            }

            @unlink($path);
            $this->viewWithLayout('import/revenue/upload', 'Import Pendapatan', 'import', [
                'entities' => (new EntityRepository())->listActive(),
                'sources' => (new ImportSourceRepository())->listActiveByType('revenue'),
                'error' => $analysis['error'],
            ]);
            return;
        }

        $this->viewWithLayout('import/revenue/preview', 'Preview Import Pendapatan', 'import', $context + [
            'headerRowNumber' => $analysis['headerRowNumber'],
            'headerConfidenceLow' => $analysis['headerConfidenceLow'],
            'duplicateFileOfBatchId' => $analysis['duplicateFileOfBatchId'],
            'stats' => $analysis['stats'],
            'samples' => $analysis['samples'],
        ]);
    }

    public function confirm(): void
    {
        $token = (string) $this->input('token', '');
        $extension = (string) $this->input('extension', '');
        $originalFilename = (string) $this->input('original_filename', '');
        $headerRowNumber = $this->input('header_row_number', '') !== '' ? (int) $this->input('header_row_number') : null;
        $entityId = $this->input('entity_id', '') ?: null;
        $sourceName = trim((string) $this->input('source_name', '')) ?: null;
        $importSourceId = $this->input('import_source_id', '') ?: null;

        $path = UploadValidator::resolveToken($token, $extension, $this->uploadsTmpDir());
        if ($path === null) {
            Flash::set('error', 'Sesi upload sudah tidak berlaku - silakan unggah ulang file.');
            $this->redirect('/import/revenue');
            return;
        }

        $savedMapping = null;
        if ($importSourceId !== null) {
            $source = (new ImportSourceRepository())->findById($importSourceId);
            if ($source !== null && $source['column_mapping'] !== null) {
                $savedMapping = json_decode((string) $source['column_mapping'], true);
            }
        }

        $result = (new RevenueImportPipeline())->commit(
            $path,
            $originalFilename !== '' ? $originalFilename : 'unknown',
            $headerRowNumber,
            $savedMapping,
            $entityId,
            $this->currentUser()['id'],
            $sourceName,
            $importSourceId
        );

        if (!$result['ok']) {
            Flash::set('error', 'Import gagal: ' . $result['error']);
            $this->redirect('/import/revenue');
            return;
        }

        @unlink($path);

        Flash::set('success', 'Import berhasil diproses. Total baris: ' . $result['stats']['total_rows'] . '.');
        $this->redirect('/import/revenue/batches/' . $result['batchId']);
    }

    public function cancel(): void
    {
        $token = (string) $this->input('token', '');
        $extension = (string) $this->input('extension', '');
        $path = UploadValidator::resolveToken($token, $extension, $this->uploadsTmpDir());
        if ($path !== null) {
            @unlink($path);
        }
        $this->redirect('/import/revenue');
    }

    public function showBatch(array $params): void
    {
        $repo = new ImportBatchRepository();
        $batch = $repo->findBatchById($params['id']);
        if ($batch === null || $batch['source_type'] !== 'revenue') {
            throw new HttpException(404, 'Batch import tidak ditemukan');
        }

        $filter = isset($_GET['filter']) && $_GET['filter'] !== '' ? (string) $_GET['filter'] : null;
        $total = $repo->countNormalizedRevenueForBatch($batch['id'], $filter);
        $paginator = Paginator::fromRequest($total);
        $rows = $repo->paginateNormalizedRevenueForBatch($paginator, $batch['id'], $filter);

        $this->viewWithLayout('import/revenue/batch-show', 'Detail Import Pendapatan', 'import', [
            'batch' => $batch,
            'rows' => $rows,
            'paginator' => $paginator,
            'filter' => $filter ?? '',
        ]);
    }

    /**
     * @return array{ok: true, token: string, extension: string, path: string, originalFilename: string}
     *       | array{ok: false, error: string}
     */
    private function resolveUploadedFile(): array
    {
        if (isset($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE) {
            $stored = UploadValidator::validateAndStore($_FILES['file'], $this->uploadsTmpDir());
            if (!$stored['ok']) {
                return ['ok' => false, 'error' => $stored['error']];
            }
            return [
                'ok' => true,
                'token' => $stored['token'],
                'extension' => $stored['extension'],
                'path' => $stored['storedPath'],
                'originalFilename' => $_FILES['file']['name'],
            ];
        }

        $token = (string) $this->input('token', '');
        $extension = (string) $this->input('extension', '');
        $originalFilename = (string) $this->input('original_filename', '');
        $path = UploadValidator::resolveToken($token, $extension, $this->uploadsTmpDir());
        if ($path === null) {
            return ['ok' => false, 'error' => 'Sesi upload sudah tidak berlaku - silakan unggah ulang file.'];
        }
        return ['ok' => true, 'token' => $token, 'extension' => $extension, 'path' => $path, 'originalFilename' => $originalFilename];
    }

    private function uploadsTmpDir(): string
    {
        return config('app.storage_path') . '/uploads/import-tmp';
    }
}
