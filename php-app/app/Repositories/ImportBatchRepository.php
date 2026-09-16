<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Helpers\Uuid;
use PDO;

final class ImportBatchRepository
{
    /** @param array<string, mixed> $data */
    public function createBatch(PDO $pdo, array $data): string
    {
        $id = Uuid::v4();
        $stmt = $pdo->prepare(
            'INSERT INTO import_batches
               (id, source_type, source_name, import_source_id, original_filename, stored_filename, file_checksum,
                entity_id, uploaded_by, header_row_number, status)
             VALUES (:id, :source_type, :source_name, :import_source_id, :original_filename, :stored_filename, :checksum,
                     :entity_id, :uploaded_by, :header_row_number, :status)'
        );
        $stmt->execute([
            'id' => $id,
            'source_type' => $data['source_type'],
            'source_name' => $data['source_name'] ?? null,
            'import_source_id' => $data['import_source_id'] ?? null,
            'original_filename' => $data['original_filename'],
            'stored_filename' => $data['stored_filename'] ?? null,
            'checksum' => $data['file_checksum'] ?? null,
            'entity_id' => $data['entity_id'] ?? null,
            'uploaded_by' => $data['uploaded_by'] ?? null,
            'header_row_number' => $data['header_row_number'] ?? null,
            'status' => $data['status'] ?? 'processing',
        ]);
        return $id;
    }

    public function updateBatchStats(PDO $pdo, string $batchId, array $stats, string $status): void
    {
        $stmt = $pdo->prepare(
            'UPDATE import_batches SET
               total_rows = :total_rows, candidate_rows = :candidate_rows, valid_rows = :valid_rows,
               ignored_rows = :ignored_rows, duplicate_rows = :duplicate_rows,
               suspected_duplicate_rows = :suspected_duplicate_rows, error_rows = :error_rows,
               status = :status, completed_at = NOW()
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $batchId,
            'total_rows' => $stats['total_rows'],
            'candidate_rows' => $stats['candidate_rows'],
            'valid_rows' => $stats['valid_rows'],
            'ignored_rows' => $stats['ignored_rows'],
            'duplicate_rows' => $stats['duplicate_rows'],
            'suspected_duplicate_rows' => $stats['suspected_duplicate_rows'],
            'error_rows' => $stats['error_rows'],
            'status' => $status,
        ]);
    }

    public function markBatchFailed(PDO $pdo, string $batchId, string $reason): void
    {
        $stmt = $pdo->prepare("UPDATE import_batches SET status = 'failed', failure_reason = :reason, completed_at = NOW() WHERE id = :id");
        $stmt->execute(['id' => $batchId, 'reason' => $reason]);
    }

    public function insertRawRow(PDO $pdo, string $batchId, int $rowNumber, array $payload, string $parseStatus = 'ok', ?string $parseError = null): string
    {
        $id = Uuid::v4();
        $stmt = $pdo->prepare(
            'INSERT INTO raw_import_rows (id, import_batch_id, source_row_number, raw_payload, parse_status, parse_error)
             VALUES (:id, :batch_id, :row_number, :payload, :parse_status, :parse_error)'
        );
        $stmt->execute([
            'id' => $id,
            'batch_id' => $batchId,
            'row_number' => $rowNumber,
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'parse_status' => $parseStatus,
            'parse_error' => $parseError,
        ]);
        return $id;
    }

    /** spec J priority #3 (source file identity): a prior, successfully COMPLETED batch of the same file - a failed/never-finished batch never counts, since none of its rows survived (the whole insert was rolled back). */
    public function findCompletedBatchByChecksum(string $sourceType, string $checksum): ?array
    {
        $stmt = Connection::instance()->prepare(
            "SELECT * FROM import_batches WHERE source_type = :source_type AND file_checksum = :checksum AND status = 'completed' ORDER BY started_at ASC LIMIT 1"
        );
        $stmt->execute(['source_type' => $sourceType, 'checksum' => $checksum]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function markRawRowError(PDO $pdo, string $rawRowId, string $message): void
    {
        $stmt = $pdo->prepare("UPDATE raw_import_rows SET parse_status = 'error', parse_error = :msg WHERE id = :id");
        $stmt->execute(['msg' => $message, 'id' => $rawRowId]);
    }

    public function countByFingerprint(string $table, string $fingerprint): int
    {
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM {$table} WHERE fingerprint = :fp");
        $stmt->execute(['fp' => $fingerprint]);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @param array<string, mixed> $data */
    public function insertNormalizedBankTransaction(PDO $pdo, array $data): string
    {
        $id = Uuid::v4();
        $stmt = $pdo->prepare(
            'INSERT INTO normalized_bank_transactions
               (id, import_batch_id, raw_row_id, bank_account_id, transaction_date, source_unit, classification,
                description, debit_amount, credit_amount, balance_amount, normalized_amount, transaction_type,
                fingerprint, occurrence_index, dedupe_key, duplicate_status, validation_status)
             VALUES (:id, :batch_id, :raw_row_id, :bank_account_id, :transaction_date, :source_unit, :classification,
                     :description, :debit_amount, :credit_amount, :balance_amount, :normalized_amount, :transaction_type,
                     :fingerprint, :occurrence_index, :dedupe_key, :duplicate_status, :validation_status)'
        );
        $stmt->execute([
            'id' => $id,
            'batch_id' => $data['import_batch_id'],
            'raw_row_id' => $data['raw_row_id'],
            'bank_account_id' => $data['bank_account_id'],
            'transaction_date' => $data['transaction_date'],
            'source_unit' => $data['source_unit'],
            'classification' => $data['classification'],
            'description' => $data['description'],
            'debit_amount' => $data['debit_amount'],
            'credit_amount' => $data['credit_amount'],
            'balance_amount' => $data['balance_amount'],
            'normalized_amount' => $data['normalized_amount'],
            'transaction_type' => $data['transaction_type'],
            'fingerprint' => $data['fingerprint'],
            'occurrence_index' => $data['occurrence_index'],
            'dedupe_key' => $data['dedupe_key'],
            'duplicate_status' => $data['duplicate_status'],
            'validation_status' => $data['validation_status'],
        ]);
        return $id;
    }

    /** @param array<string, mixed> $data */
    public function insertNormalizedRevenueTransaction(PDO $pdo, array $data): string
    {
        $id = Uuid::v4();
        $stmt = $pdo->prepare(
            'INSERT INTO normalized_revenue_transactions
               (id, import_batch_id, raw_row_id, outlet_id, transaction_date, revenue_category, description,
                amount, external_reference, fingerprint, occurrence_index, dedupe_key, duplicate_status, validation_status)
             VALUES (:id, :batch_id, :raw_row_id, :outlet_id, :transaction_date, :revenue_category, :description,
                     :amount, :external_reference, :fingerprint, :occurrence_index, :dedupe_key, :duplicate_status, :validation_status)'
        );
        $stmt->execute([
            'id' => $id,
            'batch_id' => $data['import_batch_id'],
            'raw_row_id' => $data['raw_row_id'],
            'outlet_id' => $data['outlet_id'],
            'transaction_date' => $data['transaction_date'],
            'revenue_category' => $data['revenue_category'],
            'description' => $data['description'],
            'amount' => $data['amount'],
            'external_reference' => $data['external_reference'],
            'fingerprint' => $data['fingerprint'],
            'occurrence_index' => $data['occurrence_index'],
            'dedupe_key' => $data['dedupe_key'],
            'duplicate_status' => $data['duplicate_status'],
            'validation_status' => $data['validation_status'],
        ]);
        return $id;
    }

    public function findBatchById(string $id): ?array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT b.*, e.name AS entity_name, p.name AS uploaded_by_name FROM import_batches b
             LEFT JOIN entities e ON e.id = b.entity_id
             LEFT JOIN profiles p ON p.id = b.uploaded_by
             WHERE b.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string, mixed>> */
    public function paginateBatches(Paginator $paginator, ?string $sourceType, ?string $status, ?string $entityId): array
    {
        [$where, $params] = $this->buildBatchWhere($sourceType, $status, $entityId);
        $stmt = Connection::instance()->prepare(
            "SELECT b.*, e.name AS entity_name, p.name AS uploaded_by_name FROM import_batches b
             LEFT JOIN entities e ON e.id = b.entity_id
             LEFT JOIN profiles p ON p.id = b.uploaded_by
             {$where} ORDER BY b.started_at DESC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $paginator->perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countBatches(?string $sourceType, ?string $status, ?string $entityId): int
    {
        [$where, $params] = $this->buildBatchWhere($sourceType, $status, $entityId);
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM import_batches b {$where}");
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function buildBatchWhere(?string $sourceType, ?string $status, ?string $entityId): array
    {
        $conditions = [];
        $params = [];
        if ($sourceType !== null && $sourceType !== '') {
            $conditions[] = 'b.source_type = :source_type';
            $params[':source_type'] = $sourceType;
        }
        if ($status !== null && $status !== '') {
            $conditions[] = 'b.status = :status';
            $params[':status'] = $status;
        }
        if ($entityId !== null && $entityId !== '') {
            $conditions[] = 'b.entity_id = :entity_id';
            $params[':entity_id'] = $entityId;
        }
        $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
        return [$where, $params];
    }

    /** @return list<array<string, mixed>> */
    public function paginateNormalizedBankForBatch(Paginator $paginator, string $batchId, ?string $filter = null): array
    {
        $extra = match ($filter) {
            'errors' => "AND (validation_status <> 'valid')",
            'duplicates' => "AND duplicate_status <> 'none'",
            'candidates' => "AND transaction_type = 'expense_candidate'",
            default => '',
        };
        $stmt = Connection::instance()->prepare(
            "SELECT n.*, b.bank_name, r.source_row_number FROM normalized_bank_transactions n
             LEFT JOIN banks b ON b.id = n.bank_account_id
             JOIN raw_import_rows r ON r.id = n.raw_row_id
             WHERE n.import_batch_id = :batch_id {$extra}
             ORDER BY r.source_row_number ASC LIMIT :limit OFFSET :offset"
        );
        $stmt->bindValue(':batch_id', $batchId);
        $stmt->bindValue(':limit', $paginator->perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countNormalizedBankForBatch(string $batchId, ?string $filter = null): int
    {
        $extra = match ($filter) {
            'errors' => "AND (validation_status <> 'valid')",
            'duplicates' => "AND duplicate_status <> 'none'",
            'candidates' => "AND transaction_type = 'expense_candidate'",
            default => '',
        };
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM normalized_bank_transactions WHERE import_batch_id = :batch_id {$extra}");
        $stmt->bindValue(':batch_id', $batchId);
        $stmt->execute();
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return list<array<string, mixed>> */
    public function paginateNormalizedRevenueForBatch(Paginator $paginator, string $batchId, ?string $filter = null): array
    {
        $extra = match ($filter) {
            'errors' => "AND (validation_status <> 'valid')",
            'duplicates' => "AND duplicate_status <> 'none'",
            default => '',
        };
        $stmt = Connection::instance()->prepare(
            "SELECT n.*, o.name AS outlet_name, r.source_row_number FROM normalized_revenue_transactions n
             LEFT JOIN outlets o ON o.id = n.outlet_id
             JOIN raw_import_rows r ON r.id = n.raw_row_id
             WHERE n.import_batch_id = :batch_id {$extra}
             ORDER BY r.source_row_number ASC LIMIT :limit OFFSET :offset"
        );
        $stmt->bindValue(':batch_id', $batchId);
        $stmt->bindValue(':limit', $paginator->perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countNormalizedRevenueForBatch(string $batchId, ?string $filter = null): int
    {
        $extra = match ($filter) {
            'errors' => "AND (validation_status <> 'valid')",
            'duplicates' => "AND duplicate_status <> 'none'",
            default => '',
        };
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM normalized_revenue_transactions WHERE import_batch_id = :batch_id {$extra}");
        $stmt->bindValue(':batch_id', $batchId);
        $stmt->execute();
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return list<array<string, mixed>> */
    public function rawRowsWithErrorsForBatch(string $batchId): array
    {
        $stmt = Connection::instance()->prepare(
            "SELECT * FROM raw_import_rows WHERE import_batch_id = :batch_id AND parse_status = 'error' ORDER BY source_row_number ASC"
        );
        $stmt->execute(['batch_id' => $batchId]);
        return $stmt->fetchAll();
    }
}
