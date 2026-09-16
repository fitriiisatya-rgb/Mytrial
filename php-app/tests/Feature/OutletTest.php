<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\OutletRepository;
use App\Services\OutletService;

final class OutletTest extends TestCase
{
    /** spec R.3: create outlet success */
    public function testCreateOutletSuccess(): void
    {
        $result = (new OutletService())->create([
            'entity_id' => self::ENTITY_ID, 'code' => 'OUT-NEW', 'name' => 'Outlet New',
            'area' => '', 'address' => '', 'opening_date' => '', 'partnership_start' => '', 'partnership_end' => '', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertTrue($result['ok']);
        $found = (new OutletRepository())->findById($result['id']);
        self::assertNotNull($found);
        self::assertSame(1, $this->countAuditLogs('outlet_created'));
    }

    /** spec R.4: duplicate outlet code rejected */
    public function testDuplicateOutletCodeRejected(): void
    {
        $result = (new OutletService())->create([
            'entity_id' => self::ENTITY_ID, 'code' => 'OUT-A', 'name' => 'Duplicate',
            'area' => '', 'address' => '', 'opening_date' => '', 'partnership_start' => '', 'partnership_end' => '', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('code', $result['errors']);
    }

    /** spec C: outlet does not force 1-outlet-to-1-bank-account - it's fine for an outlet to have zero or multiple bank accounts indirectly through its entity; nothing in the schema/service ties a bank 1:1 to an outlet. */
    public function testOutletDoesNotRequireExactlyOneBankAccount(): void
    {
        // seedMasterData() already gives the shared entity exactly one
        // bank while BOTH outlets exist under it - proving no 1:1
        // outlet<->bank constraint exists anywhere in the write path.
        $result = (new OutletService())->create([
            'entity_id' => self::ENTITY_ID, 'code' => 'OUT-NOBANK', 'name' => 'Outlet Without Its Own Bank',
            'area' => '', 'address' => '', 'opening_date' => '', 'partnership_start' => '', 'partnership_end' => '', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertTrue($result['ok']);
    }

    public function testOutletOwnershipIndicatorThresholds(): void
    {
        self::assertSame('valid', OutletService::ownershipIndicator(100.0));
        self::assertSame('warning', OutletService::ownershipIndicator(60.0));
        self::assertSame('invalid', OutletService::ownershipIndicator(105.0));
    }
}
