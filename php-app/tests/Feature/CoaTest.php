<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\CoaRepository;
use App\Services\CoaService;

final class CoaTest extends TestCase
{
    public function testCreateCoaSuccess(): void
    {
        $result = (new CoaService())->create([
            'code' => '999000', 'name' => 'New Account', 'account_type' => 'expense', 'parent_id' => '',
            'normal_balance' => 'debit', 'pnl_category' => 'opex', 'reporting_order' => '0', 'is_active' => true,
        ], self::ACCOUNTING_ID);

        self::assertTrue($result['ok']);
        self::assertSame(1, $this->countAuditLogs('coa_created'));
    }

    public function testDuplicateCoaCodeRejected(): void
    {
        $result = (new CoaService())->create([
            'code' => '101101', 'name' => 'Dup', 'account_type' => 'asset', 'parent_id' => '',
            'normal_balance' => 'debit', 'pnl_category' => '', 'reporting_order' => '0', 'is_active' => true,
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('code', $result['errors']);
    }

    /** spec R.7 / spec D: COA circular hierarchy rejected */
    public function testCircularHierarchyRejected(): void
    {
        // Try to make the parent (COA_ASSET_PARENT_ID) a child of its
        // own child (COA_BANK_A_ID) - a direct 2-node cycle.
        $result = (new CoaService())->update(self::COA_ASSET_PARENT_ID, [
            'code' => '101000', 'name' => 'Kas & Bank', 'account_type' => 'asset', 'parent_id' => self::COA_BANK_A_ID,
            'normal_balance' => 'debit', 'pnl_category' => '', 'reporting_order' => '0', 'is_active' => true,
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('parent_id', $result['errors']);

        // The hierarchy must be structurally unchanged after the rejection.
        $repo = new CoaRepository();
        $parent = $repo->findById(self::COA_ASSET_PARENT_ID);
        self::assertNull($parent['parent_id']);
    }

    public function testSelfAsParentRejected(): void
    {
        $result = (new CoaService())->update(self::COA_BANK_A_ID, [
            'code' => '101101', 'name' => 'Bank A Operasional', 'account_type' => 'asset', 'parent_id' => self::COA_BANK_A_ID,
            'normal_balance' => 'debit', 'pnl_category' => '', 'reporting_order' => '0', 'is_active' => true,
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('parent_id', $result['errors']);
    }

    /** spec D: deactivate, never hard-delete - there is no delete route/method anywhere in CoaController/CoaService/CoaRepository. */
    public function testDeactivateNeverHardDeletes(): void
    {
        $before = (new CoaRepository())->findById(self::COA_BANK_A_ID);
        self::assertNotNull($before);

        $result = (new CoaService())->update(self::COA_BANK_A_ID, [
            'code' => '101101', 'name' => 'Bank A Operasional', 'account_type' => 'asset', 'parent_id' => self::COA_ASSET_PARENT_ID,
            'normal_balance' => 'debit', 'pnl_category' => '', 'reporting_order' => '0', 'is_active' => false,
        ], self::ACCOUNTING_ID);

        self::assertTrue($result['ok']);
        $after = (new CoaRepository())->findById(self::COA_BANK_A_ID);
        self::assertNotNull($after);
        self::assertSame(0, (int) $after['is_active']);
    }
}
