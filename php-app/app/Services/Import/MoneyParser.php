<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * Deterministic Rupiah string -> integer sen parser (spec H) - the PHP
 * port of the same "never a float, always an exact integer of the
 * smallest unit" discipline the original system's lib/money.ts used.
 * PHP's platform int is 64-bit on every realistic deployment target
 * here, giving ample headroom for Rupiah-in-sen at any real company
 * scale - no bcmath/gmp dependency needed.
 *
 * Disambiguation rule for "which character is the decimal separator"
 * (spec H's example list mixes Indonesian '.'-thousands/','-decimal and
 * US ','-thousands/'.'-decimal conventions - a real Buku Bank export
 * uses one convention consistently, so this never needs to guess
 * across two different numbers in the same file, only within one):
 *
 * 1. Both ',' and '.' present: whichever occurs LAST (rightmost) is the
 *    decimal separator; every occurrence of the other character is a
 *    thousands separator and is stripped. ("1.000,50" and "1,000.50"
 *    both correctly yield 1000.50.)
 * 2. Only one separator character present, more than once: it can only
 *    be a thousands separator (a number has at most one decimal
 *    point), so every occurrence is stripped. ("1.000.000" -> 1000000.)
 * 3. Only one separator character present, exactly once: decided by
 *    how many digits follow it - real money amounts always have
 *    exactly 1-2 decimal digits, while a thousands group is always
 *    exactly 3 digits. 1-2 digits after -> decimal ("1,50" -> 1.50,
 *    "10.5" -> 10.5); exactly 3 digits after -> thousands ("1.000" ->
 *    1000, "1,000" -> 1000).
 */
final class MoneyParser
{
    /** @return int|null sen (Rupiah x 100), or null if the string cannot be parsed as a valid amount - never silently coerced. */
    public static function parseToSen(string $raw): ?int
    {
        $trimmed = trim($raw);
        if ($trimmed === '') {
            return 0; // spec H: blank => 0, not an error.
        }

        $negative = false;
        if (str_starts_with($trimmed, '-')) {
            $negative = true;
            $trimmed = substr($trimmed, 1);
        } elseif (str_starts_with($trimmed, '(') && str_ends_with($trimmed, ')')) {
            // Some bank exports show a debit/negative as "(1.000)".
            $negative = true;
            $trimmed = substr($trimmed, 1, -1);
        }

        $trimmed = preg_replace('/\s+/', '', $trimmed) ?? '';
        // Strip a trailing currency label some exports include (e.g. "1.000 IDR" / "Rp1.000").
        $trimmed = preg_replace('/^Rp\.?\s*/i', '', $trimmed) ?? $trimmed;
        $trimmed = preg_replace('/[A-Za-z]+$/', '', $trimmed) ?? $trimmed;

        if ($trimmed === '') {
            return 0;
        }
        if (!preg_match('/^[0-9.,]+$/', $trimmed)) {
            return null; // contains something that isn't a digit or separator - never guess.
        }

        $decimalNormalized = self::normalizeToDotDecimal($trimmed);
        if ($decimalNormalized === null) {
            return null;
        }

        if (!preg_match('/^\d+(\.\d{1,2})?$/', $decimalNormalized)) {
            return null;
        }

        [$whole, $fraction] = array_pad(explode('.', $decimalNormalized, 2), 2, '0');
        $fraction = str_pad(substr($fraction, 0, 2), 2, '0');
        $sen = ((int) $whole) * 100 + (int) $fraction;

        return $negative ? -$sen : $sen;
    }

    /** @return string|null a string using '.' as the sole decimal separator (or none), or null if ambiguous/invalid. */
    private static function normalizeToDotDecimal(string $value): ?string
    {
        $lastComma = strrpos($value, ',');
        $lastDot = strrpos($value, '.');

        if ($lastComma !== false && $lastDot !== false) {
            if ($lastComma > $lastDot) {
                // comma is decimal, dot(s) are thousands
                return str_replace(',', '.', str_replace('.', '', $value));
            }
            // dot is decimal, comma(s) are thousands
            return str_replace(',', '', $value);
        }

        if ($lastComma !== false) {
            return self::resolveSingleSeparator($value, ',');
        }

        if ($lastDot !== false) {
            return self::resolveSingleSeparator($value, '.');
        }

        return $value; // no separators at all - a plain integer string.
    }

    private static function resolveSingleSeparator(string $value, string $sep): string
    {
        $count = substr_count($value, $sep);
        if ($count > 1) {
            return str_replace($sep, '', $value);
        }

        $pos = strpos($value, $sep);
        $digitsAfter = strlen($value) - $pos - 1;

        if ($digitsAfter === 3) {
            return str_replace($sep, '', $value); // thousands group
        }

        // 1-2 digits after -> decimal.
        return str_replace($sep, '.', $value);
    }

    public static function senToDecimalString(int $sen): string
    {
        $negative = $sen < 0;
        $abs = abs($sen);
        $whole = intdiv($abs, 100);
        $fraction = $abs % 100;
        return ($negative ? '-' : '') . $whole . '.' . str_pad((string) $fraction, 2, '0', STR_PAD_LEFT);
    }
}
