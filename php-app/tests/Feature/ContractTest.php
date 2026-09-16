<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\ContractRepository;
use App\Services\ContractService;

final class ContractTest extends TestCase
{
    /** spec R.9: contract valid - creates cleanly and retained_profit_pct is correctly auto-derived (100 - distribution). */
    public function testContractValid(): void
    {
        $result = (new ContractService())->create([
            'outlet_id' => self::OUTLET_B_ID, 'contract_number' => 'PC-TEST-002',
            'start_date' => '2025-01-01', 'end_date' => '2030-01-01', 'duration_months' => '60',
            'total_investment' => '50000000', 'profit_distribution_pct' => '65', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertTrue($result['ok']);
        $found = (new ContractRepository())->findById($result['id']);
        self::assertSame('65.000', $found['profit_distribution_pct']);
        self::assertSame('35.000', $found['retained_profit_pct']);
    }

    public function testEndDateBeforeStartDateRejected(): void
    {
        $result = (new ContractService())->create([
            'outlet_id' => self::OUTLET_B_ID, 'contract_number' => 'PC-BAD',
            'start_date' => '2026-01-01', 'end_date' => '2025-01-01', 'duration_months' => '60',
            'total_investment' => '10000000', 'profit_distribution_pct' => '70', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('end_date', $result['errors']);
    }

    public function testDistributionPctOver100Rejected(): void
    {
        $result = (new ContractService())->create([
            'outlet_id' => self::OUTLET_B_ID, 'contract_number' => 'PC-BAD2',
            'start_date' => '2026-01-01', 'end_date' => '2031-01-01', 'duration_months' => '60',
            'total_investment' => '10000000', 'profit_distribution_pct' => '150', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('profit_distribution_pct', $result['errors']);
    }

    public function testDuplicateContractNumberRejected(): void
    {
        $result = (new ContractService())->create([
            'outlet_id' => self::OUTLET_B_ID, 'contract_number' => 'PC-TEST-001',
            'start_date' => '2026-01-01', 'end_date' => '2031-01-01', 'duration_months' => '60',
            'total_investment' => '10000000', 'profit_distribution_pct' => '70', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('contract_number', $result['errors']);
    }
}
