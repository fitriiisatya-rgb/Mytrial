<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * spec N: finds the header row by content signature, never assumes row
 * 1 - a real Buku Bank export has a multi-line title block before the
 * real header (spec B lesson #1/#2 carried over from the original
 * system). Scans the first $maxRowsToScan rows (title blocks in every
 * real export seen so far are well under this) and scores each by how
 * many of its cells exactly match a known column-name signature.
 */
final class HeaderDetector
{
    public const BANK_EXPENSE_SIGNATURE = ['bank', 'tanggal', 'unit', 'klasifikasi', 'deskripsi', 'debit', 'kredit', 'saldo'];
    public const REVENUE_SIGNATURE = ['date', 'tanggal', 'outlet', 'revenue category', 'kategori', 'description', 'deskripsi', 'amount', 'jumlah', 'external reference', 'referensi'];

    /**
     * @param array<int, list<string>> $rows 0-based row index => cells (only the first $maxRowsToScan need to be supplied by the caller)
     * @param list<string> $signature lower-cased expected header labels
     * @return array{rowIndex: int, score: int}|null null means low confidence - spec N: caller must ask the user to pick the header row rather than guessing.
     */
    public static function detect(array $rows, array $signature, int $maxRowsToScan = 30, int $minMatches = 4): ?array
    {
        $best = null;
        $scanned = 0;
        foreach ($rows as $rowIndex => $row) {
            if ($scanned >= $maxRowsToScan) {
                break;
            }
            $scanned++;

            $normalizedCells = array_map(static fn (string $c): string => self::normalize($c), $row);
            $score = count(array_intersect($normalizedCells, $signature));

            if ($best === null || $score > $best['score']) {
                $best = ['rowIndex' => $rowIndex, 'score' => $score];
            }
        }

        if ($best === null || $best['score'] < $minMatches) {
            return null;
        }

        return $best;
    }

    public static function normalize(string $value): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', $value) ?? $value));
    }
}
