<?php

declare(strict_types=1);

namespace App\Services\Import;

interface SpreadsheetReader
{
    /**
     * Yields one row at a time as a list of plain string cell values
     * (never a float/date object - date cells must come through as
     * whatever display string the sheet itself renders, so
     * DateParser's format-agnostic string parsing is the ONE date
     * parser both CSV and XLSX rows go through - spec M's "normalization
     * pipeline yang sama"). A blank row yields an all-empty-string
     * array, never skipped by the reader itself (spec B: "Jangan drop
     * blank rows sebelum header positioning selesai" - that decision
     * belongs to the header detector/pipeline, not the reader).
     *
     * @return \Generator<int, list<string>> 0-based row index => cell values
     */
    public function read(string $filePath): \Generator;
}
