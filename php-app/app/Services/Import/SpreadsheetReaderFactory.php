<?php

declare(strict_types=1);

namespace App\Services\Import;

final class SpreadsheetReaderFactory
{
    public static function forFile(string $filePath): SpreadsheetReader
    {
        $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        return match ($extension) {
            'csv', 'txt' => new CsvReader(),
            'xlsx', 'xls' => new XlsxReader(),
            default => throw new \InvalidArgumentException("Unsupported file extension: .{$extension}"),
        };
    }
}
