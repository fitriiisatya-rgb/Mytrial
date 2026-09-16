<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\Import\DateParser;
use App\Services\Import\MoneyParser;

/** Phase 3 spec: money/date parsing must be deterministic and never silently guess. */
final class ImportMoneyDateParsingTest extends TestCase
{
    /** @dataProvider thousandsAndDecimalFormats */
    public function testMoneyParserThousandsAndDecimalFormats(string $input, int $expectedSen): void
    {
        self::assertSame($expectedSen, MoneyParser::parseToSen($input));
    }

    /** @return list<array{0: string, 1: int}> */
    public static function thousandsAndDecimalFormats(): array
    {
        return [
            ['1000', 100000],
            ['1.000', 100000],       // dot as thousands
            ['1,000', 100000],       // comma as thousands
            ['1.000,50', 100050],    // dot-thousands + comma-decimal (Indonesian)
            ['1,000.50', 100050],    // comma-thousands + dot-decimal (US)
            ['1.50', 150],           // single dot, 2 digits after -> decimal
            ['10.5', 1050],          // single dot, 1 digit after -> decimal
            ['1.500,50', 150050],    // fixture row 7's exact value
        ];
    }

    public function testMoneyParserNegativeAndEdgeCases(): void
    {
        self::assertSame(-100000, MoneyParser::parseToSen('-1.000'));
        self::assertSame(-100000, MoneyParser::parseToSen('(1.000)')); // parentheses = negative, spec convention
        self::assertSame(-5000000, MoneyParser::parseToSen('(50.000)')); // fixture row 8's exact value
        self::assertSame(0, MoneyParser::parseToSen(''));
        self::assertSame(0, MoneyParser::parseToSen('0'));
    }

    /** @dataProvider validDateFormats */
    public function testDateParserValidFormats(string $input, string $expected): void
    {
        self::assertSame($expected, DateParser::parseToMysqlDate($input));
    }

    /** @return list<array{0: string, 1: string}> */
    public static function validDateFormats(): array
    {
        return [
            ['01/08/2026', '2026-08-01'], // d/m/Y, Indonesian locale assumption
            ['01-08-2026', '2026-08-01'], // d-m-Y
            ['2026-08-01', '2026-08-01'], // Y-m-d
            ['2026/08/01', '2026-08-01'], // Y/m/d
        ];
    }

    /** spec: a calendar-impossible date must never be silently guessed - it returns null, never a "closest" date. */
    public function testDateParserRejectsCalendarImpossibleDates(): void
    {
        self::assertNull(DateParser::parseToMysqlDate('31/02/2026')); // fixture row 12's exact value - Feb has no 31st
        self::assertNull(DateParser::parseToMysqlDate('32/01/2026')); // no 32nd day at all
        self::assertNull(DateParser::parseToMysqlDate('01/13/2026')); // no 13th month
    }

    public function testDateParserExcelSerialNumber(): void
    {
        // Excel epoch: serial 45870 = 2025-08-01 (verified during Phase 3 dev smoke testing).
        self::assertSame('2025-08-01', DateParser::parseToMysqlDate('45870'));
    }
}
