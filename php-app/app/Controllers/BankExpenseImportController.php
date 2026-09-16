<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\EntityRepository;
use App\Repositories\ImportBatchRepository;
use App\Repositories\ImportSourceRepository;
use App\Services\Import\BankImportPipeline;
use App\Services\Import\UploadValidator;

/**
 * Upload -> Preview -> Confirm flow for Bank Expense import (spec P/Q).
 * Every action re-derives the truth from the stored temp file and the
 * current database state - a preview page's stats/samples are display
 * only, never trusted input; confirm() re-runs BankImportPipeline::analyze()
 * itself before writing anything (see BankImportPipeline::commit()).
 */
final class BankExpenseImportController extends Controller
{
    public function form(): void
    {
        $this->viewWithLayout('import/bank-expense/upload', 'Import Pengeluaran Bank', 'import', [
            'entities' => (new EntityRepository())->listActive(),
            'sources' => (new ImportSourceRepository())->listActiveByType('bank_expense'),
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
            $this->viewWithLayout('import/bank-expense/upload', 'Import Pengeluaran Bank', 'import', [
                'entities' => (new EntityRepository())->listActive(),
                'sources' => (new ImportSourceRepository())->listActiveByType('bank_expense'),
                'error' => $resolved['error'],
            ]);
            return;
        }

        ['token' => $token, 'extension' => $extension, 'path' => $path, 'originalFilename' => $originalFilename] = $resolved;

        // A saved source's own column_mapping (spec O), when selected,
        // is trusted as-is (it was already validated by
        // ImportSourceService when saved) - never re-detected.
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

        $analysis = (new BankImportPipeline())->analyze($path, $headerRowOverride, $savedMapping);

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
                $this->viewWithLayout('import/bank-expense/select-header', 'Pilih Baris Header', 'import', $context + [
                    'error' => $analysis['error'],
                    'previewRows' => $analysis['previewRows'] ?? [],
                    'currentHeaderRow' => $headerRowOverride,
                ]);
                return;
            }

            @unlink($path);
            $this->viewWithLayout('import/bank-expense/upload', 'Import Pengeluaran Bank', 'import', [
                'entities' => (new EntityRepository())->listActive(),
                'sources' => (new ImportSourceRepository())->listActiveByType('bank_expense'),
                'error' => $analysis['error'],
            ]);
            return;
        }

        $this->viewWithLayout('import/bank-expense/preview', 'Preview Import Pengeluaran Bank', 'import', $context + [
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
            $this->redirect('/import/bank-expense');
            return;
        }

        // Re-resolve the saved mapping fresh from the database, same
        // discipline as everything else here - confirm() never trusts a
        // client-supplied mapping, only the import_source_id reference.
        $savedMapping = null;
        if ($importSourceId !== null) {
            $source = (new ImportSourceRepository())->findById($importSourceId);
            if ($source !== null && $source['column_mapping'] !== null) {
                $savedMapping = json_decode((string) $source['column_mapping'], true);
            }
        }

        $result = (new BankImportPipeline())->commit(
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
            $this->redirect('/import/bank-expense');
            return;
        }

        // The raw + normalized data now lives safely in the database -
        // the temp upload copy is disposable, and deleting it keeps
        // storage/uploads from accumulating every file ever imported.
        @unlink($path);

        Flash::set('success', 'Import berhasil diproses. Total baris: ' . $result['stats']['total_rows'] . '.');
        $this->redirect('/import/bank-expense/batches/' . $result['batchId']);
    }

    public function cancel(): void
    {
        $token = (string) $this->input('token', '');
        $extension = (string) $this->input('extension', '');
        $path = UploadValidator::resolveToken($token, $extension, $this->uploadsTmpDir());
        if ($path !== null) {
            @unlink($path);
        }
        $this->redirect('/import/bank-expense');
    }

    public function showBatch(array $params): void
    {
        $repo = new ImportBatchRepository();
        $batch = $repo->findBatchById($params['id']);
        if ($batch === null || $batch['source_type'] !== 'bank_expense') {
            throw new HttpException(404, 'Batch import tidak ditemukan');
        }

        $filter = isset($_GET['filter']) && $_GET['filter'] !== '' ? (string) $_GET['filter'] : null;
        $total = $repo->countNormalizedBankForBatch($batch['id'], $filter);
        $paginator = Paginator::fromRequest($total);
        $rows = $repo->paginateNormalizedBankForBatch($paginator, $batch['id'], $filter);

        $this->viewWithLayout('import/bank-expense/batch-show', 'Detail Import Pengeluaran Bank', 'import', [
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
        // A fresh file input takes priority; a resumed manual-header-row
        // submission carries token/extension instead and never re-uploads.
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
