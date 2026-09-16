<?php

declare(strict_types=1);

namespace App\Services\Import;

/**
 * Pure, stateful-per-file row classifier (spec I/J) - "stateful" only
 * in the sense of tracking, in memory, how many times each fingerprint
 * has been seen so far WITHIN THIS ONE FILE (never touches the
 * database - that is the calling Service's job, see
 * BankImportPipeline). This is what makes re-importing the identical
 * file idempotent: occurrence_index is derived purely from a row's
 * position among same-fingerprint rows in THIS file's own content, so
 * running the identical file through a fresh instance of this class a
 * second time reproduces the exact same occurrence_index for every
 * row, byte for byte - never a moving target dependent on database
 * state (see dedupe_key discussion in database/schema/0003_transaction_import.sql).
 */
final class BankRowClassifier
{
    /** @var array<string, int> fingerprint => count seen so far in this file */
    private array $inFileOccurrence = [];

    /** @param list<array{id: string, bank_name: string}> $banks active bank accounts to match against */
    public function __construct(private readonly array $banks)
    {
    }

    /**
     * @param array<string, int|null> $mapping logical field => column index
     * @param list<string> $row
     * @return array{
     *   bank_account_id: string|null, bank_label: string, transaction_date: string|null, raw_date: string,
     *   source_unit: string|null, classification: string|null, description: string|null,
     *   debit_sen: int, credit_sen: int, balance_sen: int|null, normalized_amount_sen: int,
     *   transaction_type: string, validation_status: string, fingerprint: string, occurrence_index: int
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

        $bankLabel = trim($cell($mapping, $row, 'bank'));
        $rawDate = trim($cell($mapping, $row, 'transaction_date'));
        $unit = trim($cell($mapping, $row, 'unit'));
        $classification = trim($cell($mapping, $row, 'classification'));
        $description = trim($cell($mapping, $row, 'description'));
        $debitRaw = $cell($mapping, $row, 'debit');
        $creditRaw = $cell($mapping, $row, 'credit');
        $balanceRaw = trim($cell($mapping, $row, 'balance'));

        $date = $rawDate === '' ? null : DateParser::parseToMysqlDate($rawDate);
        $debitSen = MoneyParser::parseToSen($debitRaw);
        $creditSen = MoneyParser::parseToSen($creditRaw);
        $balanceSen = $balanceRaw === '' ? null : MoneyParser::parseToSen($balanceRaw);

        $bankAccountId = $bankLabel !== '' ? BankMatcher::match($bankLabel, $this->banks) : null;

        $validationStatus = $this->determineValidationStatus($rawDate, $date, $debitSen, $creditSen, $bankLabel, $bankAccountId);

        $debitSenSafe = $debitSen ?? 0;
        $creditSenSafe = $creditSen ?? 0;

        $transactionType = $this->determineTransactionType($validationStatus, $debitSenSafe, $creditSenSafe);
        $normalizedAmountSen = $transactionType === 'expense_candidate' ? $creditSenSafe : $debitSenSafe;

        $fingerprint = FingerprintCalculator::bankExpense($bankLabel, $date, $classification, $description, $creditSenSafe);
        $this->inFileOccurrence[$fingerprint] = ($this->inFileOccurrence[$fingerprint] ?? 0) + 1;
        $occurrenceIndex = $this->inFileOccurrence[$fingerprint];

        return [
            'bank_account_id' => $bankAccountId,
            'bank_label' => $bankLabel,
            'transaction_date' => $date,
            'raw_date' => $rawDate,
            'source_unit' => $unit !== '' ? $unit : null,
            'classification' => $classification !== '' ? $classification : null,
            'description' => $description !== '' ? $description : null,
            'debit_sen' => $debitSenSafe,
            'credit_sen' => $creditSenSafe,
            'balance_sen' => $balanceSen,
            'normalized_amount_sen' => $normalizedAmountSen,
            'transaction_type' => $transactionType,
            'validation_status' => $validationStatus,
            'fingerprint' => $fingerprint,
            'occurrence_index' => $occurrenceIndex,
        ];
    }

    private function determineValidationStatus(string $rawDate, ?string $date, ?int $debitSen, ?int $creditSen, string $bankLabel, ?string $bankAccountId): string
    {
        if ($rawDate !== '' && $date === null) {
            return 'invalid_date';
        }
        if ($debitSen === null || $creditSen === null) {
            return 'invalid_amount';
        }
        if ($debitSen < 0 || $creditSen < 0) {
            return 'negative_amount';
        }
        if ($debitSen > 0 && $creditSen > 0) {
            return 'both_debit_credit';
        }
        if ($bankAccountId === null) {
            return 'bank_not_found';
        }
        return 'valid';
    }

    /** spec I's classification ladder: hard validation failures always win; bank_not_found is a review flag layered on top, not a hard failure, so the amount-based type below still applies to it. */
    private function determineTransactionType(string $validationStatus, int $debitSen, int $creditSen): string
    {
        if ($validationStatus !== 'valid' && $validationStatus !== 'bank_not_found') {
            return 'invalid';
        }
        if ($creditSen > 0) {
            return 'expense_candidate';
        }
        if ($debitSen > 0) {
            return 'debit_only_ignored';
        }
        return 'not_candidate';
    }
}
