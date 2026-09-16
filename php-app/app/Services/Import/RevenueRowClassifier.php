<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * Revenue's classifier (spec S) - simpler than BankRowClassifier: one
 * amount field (no debit/credit split, no transaction_type ladder), no
 * accounting treatment decided here (spec S: "Jangan buat jurnal di
 * Phase 3... jangan hardcode debit/credit account"). Still
 * stateful-per-file for occurrence_index, for the exact same reason as
 * BankRowClassifier (idempotent same-file re-import).
 */
final class RevenueRowClassifier
{
    /** @var array<string, int> fingerprint => count seen so far in this file */
    private array $inFileOccurrence = [];

    /** @param list<array{id: string, code: string, name: string}> $outlets active outlets to match against */
    public function __construct(private readonly array $outlets)
    {
    }

    /**
     * @param array<string, int|null> $mapping logical field => column index
     * @param list<string> $row
     * @return array{
     *   outlet_id: string|null, outlet_label: string, transaction_date: string|null, raw_date: string,
     *   revenue_category: string|null, description: string|null, amount_sen: int, external_reference: string|null,
     *   validation_status: string, fingerprint: string, occurrence_index: int
     * }
     */
    public function classify(array $mapping, array $row): array
    {
        $cell = static function (array $mapping, array $row, string $field): string {
            $index = $mapping[$field] ?? null;
            if ($index === null || !isset($row[$index])) {
                return '';
            }
            return (string) $row[$index];
        };

        $outletLabel = trim($cell($mapping, $row, 'outlet'));
        $rawDate = trim($cell($mapping, $row, 'transaction_date'));
        $category = trim($cell($mapping, $row, 'revenue_category'));
        $description = trim($cell($mapping, $row, 'description'));
        $amountRaw = $cell($mapping, $row, 'amount');
        $externalReference = trim($cell($mapping, $row, 'external_reference'));

        $date = $rawDate === '' ? null : DateParser::parseToMysqlDate($rawDate);
        $amountSen = MoneyParser::parseToSen($amountRaw);

        $outletId = $outletLabel !== '' ? OutletMatcher::match($outletLabel, $this->outlets) : null;

        $validationStatus = $this->determineValidationStatus($rawDate, $date, $amountSen, $outletId);
        $amountSenSafe = $amountSen ?? 0;

        $fingerprint = FingerprintCalculator::revenue(
            $outletLabel,
            $date,
            $category,
            $description,
            $amountSenSafe,
            $externalReference !== '' ? $externalReference : null
        );
        $this->inFileOccurrence[$fingerprint] = ($this->inFileOccurrence[$fingerprint] ?? 0) + 1;
        $occurrenceIndex = $this->inFileOccurrence[$fingerprint];

        return [
            'outlet_id' => $outletId,
            'outlet_label' => $outletLabel,
            'transaction_date' => $date,
            'raw_date' => $rawDate,
            'revenue_category' => $category !== '' ? $category : null,
            'description' => $description !== '' ? $description : null,
            'amount_sen' => $amountSenSafe,
            'external_reference' => $externalReference !== '' ? $externalReference : null,
            'validation_status' => $validationStatus,
            'fingerprint' => $fingerprint,
            'occurrence_index' => $occurrenceIndex,
        ];
    }

    private function determineValidationStatus(string $rawDate, ?string $date, ?int $amountSen, ?string $outletId): string
    {
        if ($rawDate !== '' && $date === null) {
            return 'invalid_date';
        }
        if ($amountSen === null || $amountSen < 0) {
            return 'invalid_amount';
        }
        if ($outletId === null) {
            return 'outlet_not_found';
        }
        return 'valid';
    }
}
