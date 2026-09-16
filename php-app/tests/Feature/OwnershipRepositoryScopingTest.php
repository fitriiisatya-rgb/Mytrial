<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\OwnershipRepository;
use App\Services\OwnershipService;

/**
 * spec R.20: repository scoping works. Phase 1's RbacTest already
 * proved the pattern for ProfileRepository::findOwnProfileOnly(); this
 * is the Phase 2 equivalent for the data an investor is actually meant
 * to see once the Investor Portal exists (Phase 10) - OwnershipRepository's
 * per-investor read methods can structurally never return another
 * investor's rows, because the SQL is parameterized by the investor id
 * the caller passes in, not filtered after the fact in PHP.
 */
final class OwnershipRepositoryScopingTest extends TestCase
{
    public function testCurrentForInvestorNeverReturnsAnotherInvestorsRows(): void
    {
        $service = new OwnershipService();
        $service->create([
            'investor_id' => self::INVESTOR_A_ID, 'outlet_id' => self::OUTLET_A_ID, 'contract_id' => self::CONTRACT_A_ID,
            'ownership_pct' => '40', 'investment_amount' => '1000000', 'effective_from' => '2024-01-01',
        ], self::ACCOUNTING_ID);
        $service->create([
            'investor_id' => self::INVESTOR_B_ID, 'outlet_id' => self::OUTLET_A_ID, 'contract_id' => self::CONTRACT_A_ID,
            'ownership_pct' => '30', 'investment_amount' => '2000000', 'effective_from' => '2024-01-01',
        ], self::ACCOUNTING_ID);

        $repo = new OwnershipRepository();
        $forA = $repo->currentForInvestor(self::INVESTOR_A_ID);
        $forB = $repo->currentForInvestor(self::INVESTOR_B_ID);

        self::assertNotEmpty($forA);
        self::assertNotEmpty($forB);
        foreach ($forA as $row) {
            self::assertSame(self::INVESTOR_A_ID, $row['investor_id']);
        }
        foreach ($forB as $row) {
            self::assertSame(self::INVESTOR_B_ID, $row['investor_id']);
        }

        // Same guarantee for the full history read, not just "current".
        $historyA = $repo->historyForInvestor(self::INVESTOR_A_ID);
        foreach ($historyA as $row) {
            self::assertSame(self::INVESTOR_A_ID, $row['investor_id']);
        }
    }

    public function testCurrentForOutletNeverMixesAnotherOutletsRows(): void
    {
        $service = new OwnershipService();
        $service->create([
            'investor_id' => self::INVESTOR_A_ID, 'outlet_id' => self::OUTLET_A_ID, 'contract_id' => self::CONTRACT_A_ID,
            'ownership_pct' => '40', 'investment_amount' => '1000000', 'effective_from' => '2024-01-01',
        ], self::ACCOUNTING_ID);

        $repo = new OwnershipRepository();
        $forOutletA = $repo->currentForOutlet(self::OUTLET_A_ID);
        $forOutletB = $repo->currentForOutlet(self::OUTLET_B_ID);

        self::assertNotEmpty($forOutletA);
        self::assertEmpty($forOutletB); // no ownership was ever created for Outlet B in this test
        foreach ($forOutletA as $row) {
            self::assertSame(self::OUTLET_A_ID, $row['outlet_id']);
        }
    }
}
