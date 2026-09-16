<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * Native PHP CSV reader (spec L: "CSV: native PHP") - genuinely
 * streams line-by-line via fopen()/fgetcsv(), never loading the whole
 * file into memory (spec L/Y: large-file safety for 10k+ row files).
 * Handles a UTF-8 BOM, delimiter sniffing (comma vs semicolon vs tab -
 * Indonesian exports from Excel commonly use semicolon), and quoted
 * fields (fgetcsv's own native support).
 */
final class CsvReader implements SpreadsheetReader
{
    public function read(string $filePath): \Generator
    {
        $handle = fopen($filePath, 'rb');
        if ($handle === false) {
            throw new \RuntimeException("Could not open file for reading: {$filePath}");
        }

        try {
            $delimiter = $this->detectDelimiter($handle);

            $rowIndex = 0;
            while (($row = fgetcsv($handle, 0, $delimiter, '"', '\\')) !== false) {
                if ($rowIndex === 0) {
                    $row = $this->stripBom($row);
                }
                yield $rowIndex => array_map(
                    static fn (mixed $cell): string => is_string($cell) ? $cell : (string) ($cell ?? ''),
                    $row
                );
                $rowIndex++;
            }
        } finally {
            fclose($handle);
        }
    }

    /** Sniffs the first non-empty line for the most frequent of ',' / ';' / "\t" - never guesses beyond these three, which cover every real export this system has seen. */
    private function detectDelimiter($handle): string
    {
        $firstLine = fgets($handle);
        rewind($handle);
        if ($firstLine === false) {
            return ',';
        }

        $counts = [
            ',' => substr_count($firstLine, ','),
            ';' => substr_count($firstLine, ';'),
            "\t" => substr_count($firstLine, "\t"),
        ];
        arsort($counts);
        $best = array_key_first($counts);
        return $counts[$best] > 0 ? $best : ',';
    }

    /** @param list<string|null> $row @return list<string|null> */
    private function stripBom(array $row): array
    {
        if (isset($row[0]) && is_string($row[0])) {
            $row[0] = preg_replace('/^\xEF\xBB\xBF/', '', $row[0]) ?? $row[0];
        }
        return $row;
    }
}
