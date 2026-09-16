<?php

declare(strict_types=1);

namespace App\Services\Import;

use PhpOffice\PhpSpreadsheet\IOFactory;

/**
 * XLSX reader (spec M) via PhpOffice/PhpSpreadsheet (a real Composer
 * runtime dependency now - built locally/CI, vendor/ uploaded, never
 * requiring Composer to run on the cPanel production server itself,
 * per CPANEL_DEPLOYMENT_NOTES.md).
 *
 * Every cell is read via getFormattedValue() - the same DISPLAY STRING
 * a human reading the sheet would see (a date cell renders as whatever
 * date format the sheet applied, a number cell with a "#,##0" format
 * renders with its thousands separator) - so the exact same
 * DateParser/MoneyParser string-parsing logic CsvReader's plain text
 * cells go through applies unchanged here too (spec M: "HARUS masuk ke
 * NORMALIZATION PIPELINE YANG SAMA. Jangan duplikasi business logic").
 *
 * Known limitation: PhpSpreadsheet loads the full worksheet into
 * memory (setReadDataOnly(true) at least skips styles/formatting
 * objects) - acceptable at this system's stated 10k-100k row target,
 * flagged as a remaining risk for a much larger future file size, same
 * posture as every prior phase's own scale caveats.
 */
final class XlsxReader implements SpreadsheetReader
{
    public function read(string $filePath): \Generator
    {
        $reader = IOFactory::createReaderForFile($filePath);
        $reader->setReadDataOnly(true);
        $spreadsheet = $reader->load($filePath);
        $sheet = $spreadsheet->getActiveSheet();

        $rowIndex = 0;
        foreach ($sheet->getRowIterator() as $row) {
            $cells = [];
            $cellIterator = $row->getCellIterator();
            $cellIterator->setIterateOnlyExistingCells(false);
            foreach ($cellIterator as $cell) {
                $cells[] = $cell->getFormattedValue();
            }
            yield $rowIndex => $cells;
            $rowIndex++;
        }

        $spreadsheet->disconnectWorksheets();
        unset($spreadsheet);
    }
}
