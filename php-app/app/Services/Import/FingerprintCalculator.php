<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * spec J: "Fingerprint minimal berdasarkan: source, bank, date,
 * classification, description, credit amount" (bank expense) - and the
 * analogous fields for revenue. The fingerprint alone is deliberately
 * NOT the duplicate-detection mechanism (spec J: "fingerprint ALONE
 * tidak boleh membuat transaksi identik menjadi duplicate") - see
 * BankRowClassifier/RevenueRowClassifier for how occurrence_index
 * (this row's position among same-fingerprint rows WITHIN THE CURRENT
 * FILE, not a database-wide counter) combines with it to form the
 * actual dedupe_key.
 */
final class FingerprintCalculator
{
    public static function bankExpense(string $bankLabel, ?string $date, ?string $classification, ?string $description, int $creditSen): string
    {
        return self::hash([
            'bank_expense',
            self::normalize($bankLabel),
            $date ?? '',
            self::normalize($classification ?? ''),
            self::normalize($description ?? ''),
            (string) $creditSen,
        ]);
    }

    public static function revenue(?string $outletLabel, ?string $date, ?string $category, ?string $description, int $amountSen, ?string $externalReference): string
    {
        return self::hash([
            'revenue',
            self::normalize($outletLabel ?? ''),
            $date ?? '',
            self::normalize($category ?? ''),
            self::normalize($description ?? ''),
            (string) $amountSen,
            // An external reference, when the source provides one, is
            // the strongest possible identity signal (spec J priority
            // #1) - folding it into the fingerprint itself means two
            // rows with different references are never conflated even
            // if every other field happens to match.
            self::normalize($externalReference ?? ''),
        ]);
    }

    private static function normalize(string $value): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', $value) ?? $value));
    }

    /** @param list<string> $parts */
    private static function hash(array $parts): string
    {
        return hash('sha256', implode('|', $parts));
    }
}
