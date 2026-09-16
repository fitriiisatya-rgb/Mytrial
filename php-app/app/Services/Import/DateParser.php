<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * Buku Bank date string -> MySQL DATE ('Y-m-d'), or null on anything
 * ambiguous/invalid (spec G: "Invalid/ambiguous date: tandai error,
 * simpan raw row, jangan silently guess"). Every candidate format is
 * checked with checkdate() so a calendar-impossible date (31/02/2026)
 * is rejected rather than silently rolled forward by DateTime's own
 * lenient arithmetic.
 */
final class DateParser
{
    /** Tried in order; the first one that both matches AND is a real calendar date wins. Day-first (d/m/Y) is tried before month-first, since Buku Bank exports are Indonesian-locale (DD/MM/YYYY), never MM/DD/YYYY. */
    private const FORMATS = ['d/m/Y', 'd-m-Y', 'Y-m-d', 'Y/m/d', 'd/m/y', 'd-m-y'];

    public static function parseToMysqlDate(string $raw): ?string
    {
        $trimmed = trim($raw);
        if ($trimmed === '') {
            return null;
        }

        // A raw Excel serial date number (PhpSpreadsheet's
        // getFormattedValue() normally avoids this by rendering the
        // cell's own date format as a string first, but a source sheet
        // with no explicit date format on the column can still hand us
        // a bare serial number like "45870").
        if (preg_match('/^\d{4,6}(\.\d+)?$/', $trimmed)) {
            $serial = (float) $trimmed;
            if ($serial > 0 && $serial < 100000) {
                $unixTimestamp = ($serial - 25569) * 86400; // Excel epoch (1899-12-30) -> Unix epoch
                $date = gmdate('Y-m-d', (int) round($unixTimestamp));
                [$y] = array_map('intval', explode('-', $date));
                if ($y >= 1990 && $y <= 2100) {
                    return $date;
                }
            }
        }

        foreach (self::FORMATS as $format) {
            $parsed = \DateTime::createFromFormat('!' . $format, $trimmed);
            if ($parsed === false) {
                continue;
            }
            $errors = \DateTime::getLastErrors();
            if ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) {
                continue;
            }

            $day = (int) $parsed->format('d');
            $month = (int) $parsed->format('m');
            $year = (int) $parsed->format('Y');
            // Note on 2-digit years ('y' formats): PHP's own
            // createFromFormat() already resolves these to a 4-digit
            // year (00-69 -> 2000-2069, 70-99 -> 1970-1999) before we
            // ever read $parsed->format('Y') - no extra handling needed
            // here, just documented so it isn't mistaken for an
            // oversight.

            if (!checkdate($month, $day, $year)) {
                continue; // calendar-impossible - e.g. 31/02/2026 - never silently accepted.
            }

            return sprintf('%04d-%02d-%02d', $year, $month, $day);
        }

        return null;
    }
}
