<?php

declare(strict_types=1);

namespace App\Services\Import;

use App\Database\Connection;
use App\Repositories\BankRepository;
use App\Repositories\ImportBatchRepository;
use App\Services\AuditService;

/**
 * The one pipeline both the preview action and the confirm action call
 * (spec M: "Jangan duplikasi business logic") - analyze() never writes
 * to the database (only read-only fingerprint/checksum lookups, safe
 * to call repeatedly), commit() re-runs analyze() itself and then
 * performs the actual writes inside one transaction. Confirm never
 * trusts a client-supplied classification result from a hidden form
 * field - it always re-derives the truth from the file + the current
 * database state at the moment of commit.
 */
final class BankImportPipeline
{
    private const HEADER_PEEK_ROWS = 30;
    private const HIGH_CONFIDENCE_SCORE = 6;

    public function __construct(
        private readonly BankRepository $bankRepo = new BankRepository(),
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
            $detected = HeaderDetector::detect($peekBuffer, HeaderDetector::BANK_EXPENSE_SIGNATURE, self::HEADER_PEEK_ROWS);
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
        $mapping = ColumnMapper::mapBankExpenseColumns($headerRow, $savedMapping);
        $missingRequired = array_keys(array_filter(
            $mapping,
            static fn (?int $v, string $field): bool => $v === null && $field !== 'balance',
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

        // spec J priority #3: an exact re-upload of an already fully
        // imported file is detected FIRST, from the whole file's own
        // checksum - this is what makes same-file re-import provably
        // 100% idempotent, independent of the fingerprint+occurrence
        // fallback (which alone cannot always tell "the same file
        // again" apart from "a different file that happens to share
        // some transactions").
        $duplicateFileBatch = $this->importRepo->findCompletedBatchByChecksum('bank_expense', $fileChecksum);

        $banks = $this->bankRepo->listActiveForMatching();
        $classifier = new BankRowClassifier($banks);

        $rows = [];
        foreach ($peekBuffer as $index => $row) {
            if ($index <= $headerRowIndex) {
                continue;
            }
            $rows[$index] = $this->classifyAndDedupe($classifier, $mapping, $row, $duplicateFileBatch !== null, $fileChecksum);
        }
        // Continuing to read the rest of a large file (beyond the
        // HEADER_PEEK_ROWS peek) must NEVER use another foreach() here -
        // foreach always calls Generator::rewind() first, which throws
        // "Cannot rewind a generator that was already run" for any
        // generator already advanced past its first element (exactly
        // the case once the file has more rows than the peek window).
        // A file shorter than HEADER_PEEK_ROWS instead runs the
        // generator to natural completion inside the first loop above,
        // leaving valid() false and this while loop a no-op.
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
    private function classifyAndDedupe(BankRowClassifier $classifier, array $mapping, array $row, bool $isExactFileReimport, string $fileChecksum): array
    {
        $classified = $classifier->classify($mapping, $row);
        $fingerprint = $classified['fingerprint'];

        if ($isExactFileReimport) {
            $duplicateStatus = 'duplicate_exact';
        } else {
            $existingCount = $this->importRepo->countByFingerprint('normalized_bank_transactions', $fingerprint);
            $duplicateStatus = $existingCount > 0 ? 'duplicate_suspected' : 'none';
        }

        // duplicate_exact rows are never inserted (see commit()'s
        // `continue`), so their dedupe_key never has to coexist with
        // anything - but a 'duplicate_suspected' row that a DIFFERENT
        // file also assigns the same in-file occurrence_index to WOULD
        // collide on a bare fingerprint+occurrence_index key even
        // though spec K requires it to be inserted, never skipped. The
        // file's own checksum is folded into the key specifically to
        // keep every genuinely-inserted row's key globally unique
        // across different files, while a true re-import (same
        // checksum) still reproduces the identical key deterministically.
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
            'candidate_rows' => 0,
            'valid_rows' => 0,
            'ignored_rows' => 0,
            'duplicate_rows' => 0,
            'suspected_duplicate_rows' => 0,
            'error_rows' => 0,
            'bank_matched_rows' => 0,
            'bank_not_found_rows' => 0,
        ];
        foreach ($rows as $row) {
            if ($row['transaction_type'] === 'expense_candidate') {
                $stats['candidate_rows']++;
            }
            if ($row['transaction_type'] === 'debit_only_ignored') {
                $stats['ignored_rows']++;
            }
            if ($row['transaction_type'] === 'invalid') {
                $stats['error_rows']++;
            }
            if ($row['validation_status'] === 'valid') {
                $stats['valid_rows']++;
            }
            if ($row['validation_status'] === 'bank_not_found') {
                $stats['bank_not_found_rows']++;
            } elseif ($row['bank_account_id'] !== null) {
                $stats['bank_matched_rows']++;
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
     * Re-analyzes the file fresh (never trusts a stale client-supplied
     * result) and persists everything inside ONE transaction. A single
     * bad row is recorded (raw + an 'error' normalized outcome) and the
     * loop continues - the whole batch only fails if the file itself
     * cannot be read, the header/mapping cannot be resolved, or the
     * database transaction itself fails (spec Q).
     *
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

        $pdo = Connection::instance();

        try {
            $batchId = Connection::transaction(function (\PDO $pdo) use ($analysis, $originalFilename, $entityId, $uploadedBy, $sourceName, $importSourceId): string {
                $batchId = $this->importRepo->createBatch($pdo, [
                    'source_type' => 'bank_expense',
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
                            continue; // spec K: safe to auto-skip - the original row already exists from an earlier import.
                        }

                        $this->importRepo->insertNormalizedBankTransaction($pdo, [
                            'import_batch_id' => $batchId,
                            'raw_row_id' => $rawRowId,
                            'bank_account_id' => $row['bank_account_id'],
                            'transaction_date' => $row['transaction_date'],
                            'source_unit' => $row['source_unit'],
                            'classification' => $row['classification'],
                            'description' => $row['description'],
                            'debit_amount' => MoneyParser::senToDecimalString($row['debit_sen']),
                            'credit_amount' => MoneyParser::senToDecimalString($row['credit_sen']),
                            'balance_amount' => $row['balance_sen'] !== null ? MoneyParser::senToDecimalString($row['balance_sen']) : null,
                            'normalized_amount' => MoneyParser::senToDecimalString($row['normalized_amount_sen']),
                            'transaction_type' => $row['transaction_type'],
                            'fingerprint' => $row['fingerprint'],
                            'occurrence_index' => $row['occurrence_index'],
                            'dedupe_key' => $row['dedupe_key'],
                            'duplicate_status' => $row['duplicate_status'],
                            'validation_status' => $row['validation_status'],
                        ]);
                    } catch (\Throwable $e) {
                        // A single row's failure never kills the batch
                        // (spec Q) - record it as a parse error against
                        // its own raw row rather than inserting a second,
                        // duplicate raw-row entry for the same source line.
                        $errorRows++;
                        if ($rawRowId !== null) {
                            $this->importRepo->markRawRowError($pdo, $rawRowId, $e->getMessage());
                        } else {
                            try {
                                $this->importRepo->insertRawRow($pdo, $batchId, $rowNumber, $row['raw_row'], 'error', $e->getMessage());
                            } catch (\Throwable) {
                                // The raw row itself could not be recorded either - the row's
                                // error is still counted in error_rows; the batch keeps going.
                            }
                        }
                    }
                }

                $stats = [
                    'total_rows' => $analysis['stats']['total_rows'],
                    'candidate_rows' => $analysis['stats']['candidate_rows'],
                    'valid_rows' => $analysis['stats']['valid_rows'],
                    'ignored_rows' => $analysis['stats']['ignored_rows'],
                    'duplicate_rows' => $analysis['stats']['duplicate_rows'],
                    'suspected_duplicate_rows' => $analysis['stats']['suspected_duplicate_rows'],
                    'error_rows' => $analysis['stats']['error_rows'] + $errorRows,
                ];
                $this->importRepo->updateBatchStats($pdo, $batchId, $stats, 'completed');

                AuditService::log($uploadedBy, 'import_batch_completed', 'import_batches', $batchId, null, [
                    'source_type' => 'bank_expense',
                    'original_filename' => $originalFilename,
                    'stats' => $stats,
                ]);

                return $batchId;
            });
        } catch (\Throwable $e) {
            // Only a database-transaction-fatal failure reaches here
            // (per-row failures are already caught above and don't
            // propagate) - the whole batch is marked failed, per spec Q.
            return ['ok' => false, 'error' => 'Import batch gagal karena kesalahan database: ' . $e->getMessage()];
        }

        return ['ok' => true, 'batchId' => $batchId, 'stats' => $analysis['stats']];
    }
}
