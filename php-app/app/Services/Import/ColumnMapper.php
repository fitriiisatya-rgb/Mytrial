<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * spec O: default column mapping by header-label synonym, with support
 * for a saved, reusable per-source override (import_sources.column_mapping)
 * when a source's real headers differ from the default Indonesian
 * labels.
 */
final class ColumnMapper
{
    /** @var array<string, list<string>> logical field => accepted header-label synonyms (already lower-cased) */
    private const BANK_EXPENSE_FIELDS = [
        'bank' => ['bank'],
        'transaction_date' => ['tanggal', 'date'],
        'unit' => ['unit', 'outlet'],
        'classification' => ['klasifikasi', 'classification'],
        'description' => ['deskripsi', 'description', 'keterangan'],
        'debit' => ['debit'],
        'credit' => ['kredit', 'credit'],
        'balance' => ['saldo', 'balance'],
    ];

    /** @var array<string, list<string>> */
    private const REVENUE_FIELDS = [
        'transaction_date' => ['date', 'tanggal'],
        'outlet' => ['outlet', 'unit'],
        'revenue_category' => ['revenue category', 'kategori', 'category', 'klasifikasi'],
        'description' => ['description', 'deskripsi', 'keterangan'],
        'amount' => ['amount', 'jumlah', 'nominal'],
        'external_reference' => ['external reference', 'referensi', 'reference', 'ref'],
    ];

    /**
     * @param list<string> $headerRow
     * @param array<string, int|null>|null $savedMapping a previously-validated import_sources.column_mapping - trusted as-is, never re-detected.
     * @return array<string, int|null> field => column index (null = not found)
     */
    public static function mapBankExpenseColumns(array $headerRow, ?array $savedMapping = null): array
    {
        return $savedMapping ?? self::detect($headerRow, self::BANK_EXPENSE_FIELDS);
    }

    /** @param list<string> $headerRow @param array<string, int|null>|null $savedMapping @return array<string, int|null> */
    public static function mapRevenueColumns(array $headerRow, ?array $savedMapping = null): array
    {
        return $savedMapping ?? self::detect($headerRow, self::REVENUE_FIELDS);
    }

    /** @return list<string> every logical field name a bank-expense mapping must resolve, for a "missing required column" check by the caller. */
    public static function bankExpenseRequiredFields(): array
    {
        return array_keys(self::BANK_EXPENSE_FIELDS);
    }

    /** @return list<string> */
    public static function revenueRequiredFields(): array
    {
        return array_keys(self::REVENUE_FIELDS);
    }

    /**
     * @param list<string> $headerRow
     * @param array<string, list<string>> $fields
     * @return array<string, int|null>
     */
    private static function detect(array $headerRow, array $fields): array
    {
        $normalized = array_map(static fn (string $c): string => HeaderDetector::normalize($c), $headerRow);
        $result = [];
        foreach ($fields as $field => $synonyms) {
            $result[$field] = null;
            foreach ($synonyms as $synonym) {
                $index = array_search($synonym, $normalized, true);
                if ($index !== false) {
                    $result[$field] = $index;
                    break;
                }
            }
        }
        return $result;
    }
}
