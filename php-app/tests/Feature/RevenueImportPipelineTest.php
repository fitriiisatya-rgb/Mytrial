<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Database\Connection;
use App\Services\Import\RevenueImportPipeline;

/** spec S: Revenue import - separate, simpler pipeline (no debit/credit ladder, no journal creation), but the same outlet-matching and duplicate-detection discipline as Bank Expense. */
final class RevenueImportPipelineTest extends TestCase
{
    private function writeCsv(string $content): string
    {
        $path = sys_get_temp_dir() . '/revenue_test_' . bin2hex(random_bytes(8)) . '.csv';
        file_put_contents($path, $content);
        return $path;
    }

    public function testRevenueImportOutletMatchingAndValidationLadder(): void
    {
        $csv = $this->writeCsv(
            "Date,Outlet,Revenue Category,Description,Amount,External Reference\n"
            . "01/08/2026,OUT-A,Penjualan Makanan,Omzet harian,1.500.000,INV-001\n"
            . "02/08/2026,UnknownOutlet,Penjualan Minuman,Omzet harian,300.000,INV-002\n"
            . "31/02/2026,OUT-B,Penjualan Makanan,Tanggal tidak valid,200.000,INV-003\n"
            . "03/08/2026,OUT-A,Penjualan Makanan,Nominal negatif,-50.000,INV-004\n"
        );

        try {
            $analysis = (new RevenueImportPipeline())->analyze($csv);
        } finally {
            unlink($csv);
        }

        self::assertTrue($analysis['ok'], $analysis['error'] ?? '');
        $rows = array_values($analysis['rows']);

        self::assertSame('valid', $rows[0]['validation_status']);
        self::assertNotNull($rows[0]['outlet_id']);
        self::assertSame(150000000, $rows[0]['amount_sen']);

        self::assertSame('outlet_not_found', $rows[1]['validation_status']);
        self::assertNull($rows[1]['outlet_id']);

        self::assertSame('invalid_date', $rows[2]['validation_status']);
        self::assertNull($rows[2]['transaction_date']);

        self::assertSame('invalid_amount', $rows[3]['validation_status']);
    }

    /** Same checksum-based idempotency guarantee as Bank Expense - re-importing an identical Revenue file inserts zero new rows. */
    public function testRevenueImportDuplicateFileReimportIdempotent(): void
    {
        $csv = $this->writeCsv(
            "Date,Outlet,Revenue Category,Description,Amount,External Reference\n"
            . "01/08/2026,OUT-A,Penjualan Makanan,Omzet harian,1.500.000,INV-001\n"
            . "01/08/2026,OUT-A,Penjualan Makanan,Omzet harian,1.500.000,INV-002\n"
        );

        try {
            $pipeline = new RevenueImportPipeline();
            $first = $pipeline->commit($csv, 'revenue.csv', null, null, self::ENTITY_ID, self::ACCOUNTING_ID, null, null);
            self::assertTrue($first['ok'], $first['error'] ?? '');
            $countAfterFirst = $this->countNormalizedRevenueRows();

            $second = $pipeline->commit($csv, 'revenue.csv', null, null, self::ENTITY_ID, self::ACCOUNTING_ID, null, null);
            self::assertTrue($second['ok'], $second['error'] ?? '');

            self::assertSame(2, $second['stats']['duplicate_rows']);
            self::assertSame($countAfterFirst, $this->countNormalizedRevenueRows());
        } finally {
            unlink($csv);
        }
    }

    /** Same generator-continuation regression as BankImportPipelineTest::testFileLargerThanHeaderPeekWindowDoesNotCrash() - RevenueImportPipeline has the identical peek/continue structure. */
    public function testFileLargerThanHeaderPeekWindowDoesNotCrash(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'large_revenue_') . '.csv';
        $fh = fopen($path, 'w');
        fputcsv($fh, ['Date', 'Outlet', 'Revenue Category', 'Description', 'Amount', 'External Reference'], ',', '"', '\\');
        $expectedRows = 50;
        for ($i = 0; $i < $expectedRows; $i++) {
            fputcsv($fh, ['01/08/2026', 'OUT-A', 'Penjualan Makanan', "Baris ke-{$i}", (string) (1000 + $i), "REF-{$i}"], ',', '"', '\\');
        }
        fclose($fh);

        try {
            $analysis = (new RevenueImportPipeline())->analyze($path);
        } finally {
            unlink($path);
        }

        self::assertTrue($analysis['ok'], $analysis['error'] ?? '');
        self::assertSame($expectedRows, $analysis['stats']['total_rows']);
        $rows = array_values($analysis['rows']);
        self::assertSame('Baris ke-49', $rows[$expectedRows - 1]['description']);
    }

    private function countNormalizedRevenueRows(): int
    {
        $stmt = Connection::instance()->query('SELECT COUNT(*) AS c FROM normalized_revenue_transactions');
        return (int) $stmt->fetch()['c'];
    }
}
