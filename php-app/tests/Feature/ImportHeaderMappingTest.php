<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\Import\BankMatcher;
use App\Services\Import\BankRowClassifier;
use App\Services\Import\ColumnMapper;
use App\Services\Import\HeaderDetector;

/** Phase 3 spec: header detection never assumes row 1, bank matching never fuzzy, repeated identical transactions never falsely deduped in-file. */
final class ImportHeaderMappingTest extends TestCase
{
    /** spec: a multi-row title block + blank line before the real header must not confuse detection - the header is found by content signature, not position. */
    public function testHeaderDetectorFindsHeaderDespiteTitleBlockAndBlankRows(): void
    {
        $rows = [
            0 => ['LAPORAN REKENING KORAN'],
            1 => ['Periode: Agustus 2026'],
            2 => [],
            3 => ['Bank', 'Tanggal', 'Unit', 'Klasifikasi', 'Deskripsi', 'Debit', 'Kredit', 'Saldo'],
            4 => ['Test Bank', '01/08/2026', 'OUT-A', 'Administrasi Bank', 'Biaya admin', '0', '15.000', '985.000'],
        ];
        $detected = HeaderDetector::detect($rows, HeaderDetector::BANK_EXPENSE_SIGNATURE);
        self::assertNotNull($detected);
        self::assertSame(3, $detected['rowIndex']);
        self::assertSame(8, $detected['score']); // all 8 signature words matched
    }

    /** spec: low-confidence detection must return null (caller falls back to manual header-row selection), never guess. */
    public function testHeaderDetectorLowConfidenceTriggersManualSelection(): void
    {
        $rows = [
            0 => ['Some Title'],
            1 => ['Acc', 'Dt', 'Branch', 'Type', 'Note', 'Out', 'In', 'Bal'], // no recognizable signature words
        ];
        $detected = HeaderDetector::detect($rows, HeaderDetector::BANK_EXPENSE_SIGNATURE);
        self::assertNull($detected);
    }

    public function testColumnMapperDefaultSynonymDetection(): void
    {
        $headerRow = ['Bank', 'Tanggal', 'Unit', 'Klasifikasi', 'Deskripsi', 'Debit', 'Kredit', 'Saldo'];
        $mapping = ColumnMapper::mapBankExpenseColumns($headerRow);
        self::assertSame(0, $mapping['bank']);
        self::assertSame(1, $mapping['transaction_date']);
        self::assertSame(5, $mapping['debit']);
        self::assertSame(6, $mapping['credit']);
        self::assertSame([], array_diff(ColumnMapper::bankExpenseRequiredFields(), array_keys($mapping)));
    }

    /** spec F: exact match then normalized-exact fallback only - never fuzzy, never auto-creates. */
    public function testBankMatcherExactAndNormalizedOnlyNoFuzzy(): void
    {
        $banks = [['id' => 'b1', 'bank_name' => 'BCA AMOR 352-3722227']];

        self::assertSame('b1', BankMatcher::match('BCA AMOR 352-3722227', $banks)); // exact
        self::assertSame('b1', BankMatcher::match('  BCA AMOR 352-3722227  ', $banks)); // normalized (whitespace)
        self::assertNull(BankMatcher::match('BCA', $banks)); // never fuzzy-matches a partial/generic label
        self::assertNull(BankMatcher::match('Unknown Bank', $banks));
    }

    /** spec B/J's core carried-over lesson: two genuinely repeated identical transactions (same day/amount/desc/classification) in one file must NEVER be treated as duplicates of each other - each gets its own distinct occurrence_index and both are kept. */
    public function testBankRowClassifierRepeatedIdenticalTransactionsGetDistinctOccurrenceNeverDeduped(): void
    {
        $banks = [['id' => 'b1', 'bank_name' => 'Test Bank']];
        $classifier = new BankRowClassifier($banks);
        $mapping = ColumnMapper::mapBankExpenseColumns(['Bank', 'Tanggal', 'Unit', 'Klasifikasi', 'Deskripsi', 'Debit', 'Kredit', 'Saldo']);

        $row = ['Test Bank', '01/08/2026', 'OUT-A', 'Administrasi Bank', 'Biaya admin bulanan', '0', '15.000', '985.000'];
        $first = $classifier->classify($mapping, $row);
        $second = $classifier->classify($mapping, $row); // identical row, same file, second occurrence

        self::assertSame($first['fingerprint'], $second['fingerprint']);
        self::assertSame(1, $first['occurrence_index']);
        self::assertSame(2, $second['occurrence_index']);
        self::assertSame('expense_candidate', $first['transaction_type']);
        self::assertSame('expense_candidate', $second['transaction_type']);
    }
}
