<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * spec S: matches a Revenue source row's "Outlet" label against Phase
 * 2's `outlets` - exact match first (against either `code` or `name`,
 * since a source may use either), then a normalized-exact fallback,
 * same discipline as BankMatcher (no fuzzy matching, never auto-creates
 * an outlet on a miss - an unmatched row is flagged `outlet_not_found`).
 */
final class OutletMatcher
{
    /** @param list<array{id: string, code: string, name: string}> $outlets */
    public static function match(string $outletLabel, array $outlets): ?string
    {
        $trimmedLabel = trim($outletLabel);
        if ($trimmedLabel === '') {
            return null;
        }

        foreach ($outlets as $outlet) {
            if ($outlet['code'] === $trimmedLabel || $outlet['name'] === $trimmedLabel) {
                return $outlet['id'];
            }
        }

        $normalizedLabel = self::normalize($outletLabel);
        foreach ($outlets as $outlet) {
            if (self::normalize($outlet['code']) === $normalizedLabel || self::normalize($outlet['name']) === $normalizedLabel) {
                return $outlet['id'];
            }
        }

        return null;
    }

    private static function normalize(string $value): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', $value) ?? $value));
    }
}
