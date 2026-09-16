<?php

declare(strict_types=1);

namespace App\Services\Import;

use App\Database\Connection;
use App\Repositories\ImportBatchRepository;
use App\Repositories\OutletRepository;
use App\Services\AuditService;

/**
 * Revenue's counterpart to BankImportPipeline (spec S) - same shared
 * reader/header-detection/checksum-dedupe machinery, simplified where
 * Revenue itself is simpler: one amount field, no debit/credit ladder,
 * and critically no journal/account posting of any kind (that stays out
 * of scope for Phase 3 entirely - see RevenueRowClassifier).
 */
final class RevenueImportPipeline
{
    private const HEADER_PEEK_ROWS = 30;
    private const HIGH_CONFIDENCE_SCORE = 5;

    public function __construct(
        private readonly OutletRepository $outletRepo = new OutletRepository(),
        private readonly ImportBatchRepository $importRepo = new ImportBatchRepository()
    ) {
    }

    /**
     * @param array<string, int|null>|null $savedMapping
     * @return array{
     *   ok: bool, error?: string, needsManualHeaderRow?: bool, previewRows?: array,
     *   headerRowNumber?: int, headerConfidenceLow?: bool, mapping?: array<string,int|null>,
     *   fileChecksum?: string, duplicateFileOfBatchId?: string|null,
     *   rows?: list<array<string, mixed>>, stats?: array<string, int>, samples?: list<array<string, mixed>>
     * }
     */
    public function analyze(string $filePath, ?int $headerRowOverride = null, ?array $savedMapping = null): array
    {
        try {
            $reader = SpreadsheetReaderFactory::forFile($filePath);
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => 'File tidak dapat dibaca: ' . $e->getMessage()];
        }

        $fileChecksum = hash_file('sha256', $filePath);
        if ($fileChecksum === false) {
            return ['ok' => false, 'error' => 'Gagal membaca isi file.'];
        }

        try {
            $generator = $reader->read($filePath);
            $peekBuffer = [];
            foreach ($generator as $index => $row) {
                $peekBuffer[$index] = $row;
                if (count($peekBuffer) >= self::HEADER_PEEK_ROWS) {
                    break;
                }
            }
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => 'File tidak dapat dibaca: ' . $e->getMessage()];
        }

        if ($peekBuffer === []) {
            return ['ok' => false, 'error' => 'File kosong atau tidak berisi data.'];
        }

        if ($headerRowOverride !== null) {
            if (!isset($peekBuffer[$headerRowOverride])) {
                return ['ok' => false, 'error' => 'Baris header yang dipilih tidak valid.'];
            }
            $headerRowIndex = $headerRowOverride;
            $headerConfidenceLow = false;
        } else {
            $detected = HeaderDetector::detect($peekBuffer, HeaderDetector::REVENUE_SIGNATURE, self::HEADER_PEEK_ROWS);
            if ($detected === null) {
                return [
                    'ok' => false,
                    'needsManualHeaderRow' => true,
                    'error' => 'Header tidak dapat dideteksi otomatis - silakan pilih baris header secara manual.',
                    'previewRows' => $peekBuffer,
                ];
            }
            $headerRowIndex = $detected['rowIndex'];
            $headerConfidenceLow = $detected['score'] < self::HIGH_CONFIDENCE_SCORE;
        }

        $headerRow = $peekBuffer[$headerRowIndex];
        $mapping = ColumnMapper::mapRevenueColumns($headerRow, $savedMapping);
        $missingRequired = array_keys(array_filter(
            $mapping,
            static fn (?int $v, string $field): bool => $v === null && $field !== 'external_reference',
            ARRAY_FILTER_USE_BOTH
        ));
        if ($missingRequired !== []) {
            return [
                'ok' => false,
                'error' => 'Kolom wajib tidak ditemukan setelah pemetaan: ' . implode(', ', $missingRequired),
                'headerRowNumber' => $headerRowIndex,
                'mapping' => $mapping,
                'previewRows' => $peekBuffer,
            ];
        }

        $duplicateFileBatch = $this->importRepo->findCompletedBatchByChecksum('revenue', $fileChecksum);

        $outlets = $this->outletRepo->listActive();
        $classifier = new RevenueRowClassifier($outlets);

        $rows = [];
        foreach ($peekBuffer as $index => $row) {
            if ($index <= $headerRowIndex) {
                continue;
            }
            $rows[$index] = $this->classifyAndDedupe($classifier, $mapping, $row, $duplicateFileBatch !== null, $fileChecksum);
        }
        // See BankImportPipeline::analyze() for why this must be a
        // while loop over the generator's own cursor, never a second
        // foreach() (which would call rewind() and throw on any
        // generator already advanced past its first element).
        while ($generator->valid()) {
            $index = $generator->key();
            $row = $generator->current();
            if (!isset($rows[$index])) {
                $rows[$index] = $this->classifyAndDedupe($classifier, $mapping, $row, $duplicateFileBatch !== null, $fileChecksum);
            }
            $generator->next();
        }

        $stats = $this->computeStats($rows);
        $samples = array_slice($rows, 0, 15, true);

        return [
            'ok' => true,
            'headerRowNumber' => $headerRowIndex,
            'headerConfidenceLow' => $headerConfidenceLow,
            'mapping' => $mapping,
            'fileChecksum' => $fileChecksum,
            'duplicateFileOfBatchId' => $duplicateFileBatch['id'] ?? null,
            'rows' => $rows,
            'stats' => $stats,
            'samples' => $samples,
        ];
    }

    /** @param array<string, int|null> $mapping @param list<string> $row @return array<string, mixed> */
    private function classifyAndDedupe(RevenueRowClassifier $classifier, array $mapping, array $row, bool $isExactFileReimport, string $fileChecksum): array
    {
        $classified = $classifier->classify($mapping, $row);
        $fingerprint = $classified['fingerprint'];

        if ($isExactFileReimport) {
            $duplicateStatus = 'duplicate_exact';
        } else {
            $existingCount = $this->importRepo->countByFingerprint('normalized_revenue_transactions', $fingerprint);
            $duplicateStatus = $existingCount > 0 ? 'duplicate_suspected' : 'none';
        }

        // See BankImportPipeline::classifyAndDedupe() for why the file's
        // own checksum is folded into the key - identical reasoning here.
        $dedupeKey = substr($fileChecksum, 0, 16) . ':' . $fingerprint . '#' . $classified['occurrence_index'];

        $classified['dedupe_key'] = $dedupeKey;
        $classified['duplicate_status'] = $duplicateStatus;
        $classified['raw_row'] = $row;
        return $classified;
    }

    /** @param array<int, array<string, mixed>> $rows @return array<string, int> */
    private function computeStats(array $rows): array
    {
        $stats = [
            'total_rows' => count($rows),
            'valid_rows' => 0,
            'duplicate_rows' => 0,
            'suspected_duplicate_rows' => 0,
            'error_rows' => 0,
            'outlet_matched_rows' => 0,
            'outlet_not_found_rows' => 0,
        ];
        foreach ($rows as $row) {
            if ($row['validation_status'] === 'valid') {
                $stats['valid_rows']++;
                $stats['outlet_matched_rows']++;
            } elseif ($row['validation_status'] === 'outlet_not_found') {
                $stats['outlet_not_found_rows']++;
            } else {
                $stats['error_rows']++;
            }
            if ($row['duplicate_status'] === 'duplicate_exact') {
                $stats['duplicate_rows']++;
            }
            if ($row['duplicate_status'] === 'duplicate_suspected') {
                $stats['suspected_duplicate_rows']++;
            }
        }
        return $stats;
    }

    /**
     * @return array{ok: bool, error?: string, batchId?: string, stats?: array<string, int>}
     */
    public function commit(
        string $filePath,
        string $originalFilename,
        ?int $headerRowOverride,
        ?array $savedMapping,
        ?string $entityId,
        ?string $uploadedBy,
        ?string $sourceName,
        ?string $importSourceId
    ): array {
        $analysis = $this->analyze($filePath, $headerRowOverride, $savedMapping);
        if (!$analysis['ok']) {
            return ['ok' => false, 'error' => $analysis['error'] ?? 'Analisis file gagal.'];
        }

        try {
            $batchId = Connection::transaction(function (\PDO $pdo) use ($analysis, $originalFilename, $entityId, $uploadedBy, $sourceName, $importSourceId): string {
                $batchId = $this->importRepo->createBatch($pdo, [
                    'source_type' => 'revenue',
                    'source_name' => $sourceName,
                    'import_source_id' => $importSourceId,
                    'original_filename' => $originalFilename,
                    'file_checksum' => $analysis['fileChecksum'],
                    'entity_id' => $entityId,
                    'uploaded_by' => $uploadedBy,
                    'header_row_number' => $analysis['headerRowNumber'],
                    'status' => 'processing',
                ]);

                $errorRows = 0;
                foreach ($analysis['rows'] as $rowNumber => $row) {
                    $rawRowId = null;
                    try {
                        $rawRowId = $this->importRepo->insertRawRow($pdo, $batchId, $rowNumber, $row['raw_row']);

                        if ($row['duplicate_status'] === 'duplicate_exact') {
                            continue;
                        }

                        $this->importRepo->insertNormalizedRevenueTransaction($pdo, [
                            'import_batch_id' => $batchId,
                            'raw_row_id' => $rawRowId,
                            'outlet_id' => $row['outlet_id'],
                            'transaction_date' => $row['transaction_date'],
                            'revenue_category' => $row['revenue_category'],
                            'description' => $row['description'],
                            'amount' => MoneyParser::senToDecimalString($row['amount_sen']),
                            'external_reference' => $row['external_reference'],
                            'fingerprint' => $row['fingerprint'],
                            'occurrence_index' => $row['occurrence_index'],
                            'dedupe_key' => $row['dedupe_key'],
                            'duplicate_status' => $row['duplicate_status'],
                            'validation_status' => $row['validation_status'],
                        ]);
                    } catch (\Throwable $e) {
                        $errorRows++;
                        if ($rawRowId !== null) {
                            $this->importRepo->markRawRowError($pdo, $rawRowId, $e->getMessage());
                        } else {
                            try {
                                $this->importRepo->insertRawRow($pdo, $batchId, $rowNumber, $row['raw_row'], 'error', $e->getMessage());
                            } catch (\Throwable) {
                                // The row's own error is still counted below; the batch keeps going.
                            }
                        }
                    }
                }

                $stats = [
                    'total_rows' => $analysis['stats']['total_rows'],
                    'candidate_rows' => $analysis['stats']['valid_rows'],
                    'valid_rows' => $analysis['stats']['valid_rows'],
                    'ignored_rows' => 0,
                    'duplicate_rows' => $analysis['stats']['duplicate_rows'],
                    'suspected_duplicate_rows' => $analysis['stats']['suspected_duplicate_rows'],
                    'error_rows' => $analysis['stats']['error_rows'] + $errorRows,
                ];
                $this->importRepo->updateBatchStats($pdo, $batchId, $stats, 'completed');

                AuditService::log($uploadedBy, 'import_batch_completed', 'import_batches', $batchId, null, [
                    'source_type' => 'revenue',
                    'original_filename' => $originalFilename,
                    'stats' => $stats,
                ]);

                return $batchId;
            });
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => 'Import batch gagal karena kesalahan database: ' . $e->getMessage()];
        }

        return ['ok' => true, 'batchId' => $batchId, 'stats' => $analysis['stats']];
    }
}
