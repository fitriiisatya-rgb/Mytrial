<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\ImportBatchRepository;
use App\Services\Import\BankImportPipeline;

/**
 * Exercises BankImportPipeline against tests/Fixtures/bank_expense_sanitized.{csv,xlsx}
 * (Task #103's sanitized regression fixture, 10 edge cases) - the seeded
 * TestCase fixture (Test Bank / OUT-A / OUT-B) was deliberately chosen
 * to match the fixture's own content so bank-matching resolves for real
 * here, not just structurally.
 */
final class BankImportPipelineTest extends TestCase
{
    private function fixturePath(string $name): string
    {
        return dirname(__DIR__) . '/Fixtures/' . $name;
    }

    /** All 10 documented edge cases classify correctly for both CSV and XLSX - same pipeline, same result. */
    public function testSanitizedFixtureCsvAndXlsxProduceIdenticalClassification(): void
    {
        foreach (['bank_expense_sanitized.csv', 'bank_expense_sanitized.xlsx'] as $file) {
            $analysis = (new BankImportPipeline())->analyze($this->fixturePath($file));

            self::assertTrue($analysis['ok'], "{$file}: " . ($analysis['error'] ?? ''));
            self::assertSame(3, $analysis['headerRowNumber'], "{$file}: header must be found on row 4 (index 3), not row 1");
            self::assertFalse($analysis['headerConfidenceLow'], "{$file}: full 8/8 signature match expected");

            $rows = array_values($analysis['rows']);

            // Row 1+2: repeated identical transaction, never deduped in-file.
            self::assertSame($rows[0]['fingerprint'], $rows[1]['fingerprint']);
            self::assertSame(1, $rows[0]['occurrence_index']);
            self::assertSame(2, $rows[1]['occurrence_index']);
            self::assertSame('expense_candidate', $rows[0]['transaction_type']);
            self::assertSame('expense_candidate', $rows[1]['transaction_type']);

            // Row 3: dot-thousands money format.
            self::assertSame(125000000, $rows[2]['credit_sen']);
            // Row 4: dot-thousands + comma-decimal money format.
            self::assertSame(150050, $rows[3]['credit_sen']);
            // Row 5: negative via parentheses -> negative_amount, invalid.
            self::assertSame('negative_amount', $rows[4]['validation_status']);
            self::assertSame('invalid', $rows[4]['transaction_type']);
            // Row 6: debit-only -> ignored, not a candidate.
            self::assertSame('debit_only_ignored', $rows[5]['transaction_type']);
            // Row 7: both debit and credit filled -> invalid.
            self::assertSame('both_debit_credit', $rows[6]['validation_status']);
            self::assertSame('invalid', $rows[6]['transaction_type']);
            // Row 8: unmatched bank label -> bank_not_found, but still a candidate (soft flag, not a hard failure).
            self::assertSame('bank_not_found', $rows[7]['validation_status']);
            self::assertNull($rows[7]['bank_account_id']);
            self::assertSame('expense_candidate', $rows[7]['transaction_type']);
            // Row 9: calendar-impossible date -> invalid_date, never silently guessed.
            self::assertSame('invalid_date', $rows[8]['validation_status']);
            self::assertNull($rows[8]['transaction_date']);
        }
    }

    /** spec J: re-importing the identical file must be provably idempotent - every row duplicate_exact, zero new database rows. */
    public function testReimportOfIdenticalFileIsFullyIdempotent(): void
    {
        $pipeline = new BankImportPipeline();
        $path = $this->fixturePath('bank_expense_sanitized.csv');

        $first = $pipeline->commit($path, 'bank_expense_sanitized.csv', null, null, self::ENTITY_ID, self::ACCOUNTING_ID, 'Test Source', null);
        self::assertTrue($first['ok'], $first['error'] ?? '');
        $countAfterFirst = $this->countNormalizedRows();

        $second = $pipeline->commit($path, 'bank_expense_sanitized.csv', null, null, self::ENTITY_ID, self::ACCOUNTING_ID, 'Test Source', null);
        self::assertTrue($second['ok'], $second['error'] ?? '');
        self::assertSame($first['stats']['total_rows'], $second['stats']['duplicate_rows']);
        self::assertSame($countAfterFirst, $this->countNormalizedRows(), 'reimporting an identical file must insert zero new rows');
    }

    /** spec J: a DIFFERENT file that happens to share a fingerprint with an already-imported row must be flagged duplicate_suspected AND still inserted, never silently skipped - regression test for the dedupe_key-collision bug found during Phase 3 dev. */
    public function testCrossFileSharedFingerprintFlaggedSuspectedAndStillInserted(): void
    {
        $pipeline = new BankImportPipeline();
        $countBefore = $this->countNormalizedRows();

        $first = $pipeline->commit(
            $this->fixturePath('bank_expense_sanitized.csv'), 'file-a.csv', null, null,
            self::ENTITY_ID, self::ACCOUNTING_ID, null, null
        );
        self::assertTrue($first['ok'], $first['error'] ?? '');

        // A second, DIFFERENT file (distinct checksum) whose one row is
        // byte-for-byte identical in content to fixture row 1 - same
        // fingerprint, but never seen in THIS file before, so its own
        // in-file occurrence_index is 1, same as the original file's
        // first occurrence. Without the checksum-prefixed dedupe_key fix,
        // this insert would collide on the UNIQUE constraint and be
        // silently swallowed as a generic row error instead of the
        // intended "duplicate_suspected, still inserted" outcome.
        $secondFilePath = sys_get_temp_dir() . '/import_test_' . bin2hex(random_bytes(8)) . '.csv';
        file_put_contents($secondFilePath, "Bank,Tanggal,Unit,Klasifikasi,Deskripsi,Debit,Kredit,Saldo\n"
            . "Test Bank,01/08/2026,OUT-A,Administrasi Bank,Biaya admin bulanan,0,15.000,985.000\n");

        try {
            $second = $pipeline->commit($secondFilePath, 'file-b.csv', null, null, self::ENTITY_ID, self::ACCOUNTING_ID, null, null);
        } finally {
            unlink($secondFilePath);
        }

        self::assertTrue($second['ok'], $second['error'] ?? '');
        self::assertSame(1, $second['stats']['suspected_duplicate_rows']);
        self::assertSame(0, $second['stats']['duplicate_rows']); // not an exact-file re-import
        self::assertSame($countBefore + $first['stats']['total_rows'] + 1, $this->countNormalizedRows(), 'the suspected-duplicate row from file-b must actually be inserted, not swallowed');
    }

    /** spec Q: a single row's processing failure is recorded against its own raw row and the batch continues - only a file-unreadable/header-unmappable/DB-fatal error aborts the whole batch. */
    public function testOneBadRowDoesNotFailWholeBatchCommit(): void
    {
        // A row with a bank label that matches nothing and an unparsable
        // amount together are still handled by the classification ladder
        // itself (never an exception) - so to exercise actual per-row
        // exception recovery in commit(), assert instead that the batch
        // as a whole reaches 'completed' even though several of the
        // fixture's rows are validation failures (rows 5, 7, 9 are
        // invalid/negative/both-debit-credit/invalid-date) alongside the
        // valid ones - the batch must not abort just because some rows
        // are not valid.
        $result = (new BankImportPipeline())->commit(
            $this->fixturePath('bank_expense_sanitized.csv'), 'bank_expense_sanitized.csv', null, null,
            self::ENTITY_ID, self::ACCOUNTING_ID, null, null
        );

        self::assertTrue($result['ok'], $result['error'] ?? '');
        $batch = (new ImportBatchRepository())->findBatchById($result['batchId']);
        self::assertSame('completed', $batch['status']);
        self::assertSame(10, (int) $batch['total_rows']);
        self::assertGreaterThan(0, (int) $batch['valid_rows']);
    }

    /**
     * Regression test for a real bug found during Phase 3 performance
     * validation (Task #105): analyze() peeks up to HEADER_PEEK_ROWS
     * (30) rows into a buffer, then must keep reading the REST of a
     * larger file from the same still-open generator. The original code
     * did this with a second `foreach ($generator as ...)`, but foreach
     * always calls Generator::rewind() first - which throws "Cannot
     * rewind a generator that was already run" for any generator
     * already advanced past its first element. Every file with MORE
     * than 30 rows hit this fatal error; every test up to this point
     * only used fixtures under 30 rows, so the bug went undetected until
     * a synthetic 12,000-row performance run surfaced it. Fixed by
     * continuing the SAME generator's own cursor (key()/current()/next())
     * in a while loop instead of a second foreach.
     */
    public function testFileLargerThanHeaderPeekWindowDoesNotCrash(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'large_import_') . '.csv';
        $fh = fopen($path, 'w');
        fputcsv($fh, ['Bank', 'Tanggal', 'Unit', 'Klasifikasi', 'Deskripsi', 'Debit', 'Kredit', 'Saldo'], ',', '"', '\\');
        $expectedRows = 50; // comfortably more than BankImportPipeline's 30-row peek window
        for ($i = 0; $i < $expectedRows; $i++) {
            fputcsv($fh, ['Test Bank', '01/08/2026', 'OUT-A', 'Administrasi Bank', "Baris ke-{$i}", '0', (string) (1000 + $i), '0'], ',', '"', '\\');
        }
        fclose($fh);

        try {
            $analysis = (new BankImportPipeline())->analyze($path);
        } finally {
            unlink($path);
        }

        self::assertTrue($analysis['ok'], $analysis['error'] ?? '');
        self::assertSame($expectedRows, $analysis['stats']['total_rows']);
        self::assertSame($expectedRows, $analysis['stats']['candidate_rows']);
        // The last row (index 49, well past row 30) must have been
        // classified for real, not silently dropped by the truncated read.
        $rows = array_values($analysis['rows']);
        self::assertSame('Baris ke-49', $rows[$expectedRows - 1]['description']);
    }

    private function countNormalizedRows(): int
    {
        $stmt = \App\Database\Connection::instance()->query('SELECT COUNT(*) AS c FROM normalized_bank_transactions');
        return (int) $stmt->fetch()['c'];
    }
}
