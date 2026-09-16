<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * spec F: matches a Buku Bank source row's "Bank" label against Phase
 * 2's `banks.bank_name` - exact match first, then a normalized-exact
 * fallback (trim/lowercase/collapse-whitespace only - spec F: "Jangan
 * fuzzy match agresif"). Never auto-creates a bank account on a miss
 * (spec F) - an unmatched row is flagged `bank_not_found` and left for
 * a human to either fix the source label or add the missing master
 * bank account first.
 *
 * Operational convention this assumes (unchanged from the original
 * system, not a Phase 3 invention): `banks.bank_name` should hold the
 * FULL distinguishing label as it appears in the source (e.g. "BCA
 * AMOR 352-3722227"), not just the generic bank brand ("BCA") - a
 * company with several accounts at the same bank needs one distinct
 * label per account for this match to disambiguate them, exactly the
 * way the original system's own seed data was structured. This needs
 * no Phase 2 schema change, per the "jangan redesign master data"
 * instruction - it is a data-entry convention, not a code constraint.
 */
final class BankMatcher
{
    /** @param list<array{id: string, bank_name: string}> $banks */
    public static function match(string $bankLabel, array $banks): ?string
    {
        $trimmedLabel = trim($bankLabel);
        if ($trimmedLabel === '') {
            return null;
        }

        foreach ($banks as $bank) {
            if ($bank['bank_name'] === $trimmedLabel) {
                return $bank['id'];
            }
        }

        $normalizedLabel = self::normalize($bankLabel);
        foreach ($banks as $bank) {
            if (self::normalize($bank['bank_name']) === $normalizedLabel) {
                return $bank['id'];
            }
        }

        return null;
    }

    private static function normalize(string $value): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', $value) ?? $value));
    }
}
