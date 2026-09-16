<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\BankRepository;
use App\Services\BankService;

final class BankTest extends TestCase
{
    /** spec R.5: bank account without COA rejected */
    public function testBankAccountWithoutCoaRejected(): void
    {
        $result = (new BankService())->create([
            'entity_id' => self::ENTITY_ID, 'bank_name' => 'No COA Bank', 'account_number' => '999-999',
            'account_name' => 'No COA', 'coa_id' => '', 'is_active' => true,
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('coa_id', $result['errors']);
    }

    /** spec R.6: bank-specific COA relation valid - every bank gets its OWN distinct COA, a second bank can never reuse one already claimed. */
    public function testBankSpecificCoaRelationValid(): void
    {
        $result = (new BankService())->create([
            'entity_id' => self::ENTITY_ID, 'bank_name' => 'Second Bank', 'account_number' => '222-222',
            'account_name' => 'Second', 'coa_id' => self::COA_BANK_B_ID, 'is_active' => true,
        ], self::ACCOUNTING_ID);
        self::assertTrue($result['ok']);

        $repo = new BankRepository();
        $bankA = $repo->findById(self::BANK_A_ID);
        $bankSecond = $repo->findById($result['id']);
        self::assertNotSame($bankA['coa_id'], $bankSecond['coa_id']);

        // Reusing an already-claimed COA (the seeded Bank A's own COA) must be rejected.
        $reuse = (new BankService())->create([
            'entity_id' => self::ENTITY_ID, 'bank_name' => 'Third Bank', 'account_number' => '333-333',
            'account_name' => 'Third', 'coa_id' => self::COA_BANK_A_ID, 'is_active' => true,
        ], self::ACCOUNTING_ID);
        self::assertFalse($reuse['ok']);
        self::assertArrayHasKey('coa_id', $reuse['errors']);
    }

    public function testDuplicateBankNameAndAccountNumberRejected(): void
    {
        $result = (new BankService())->create([
            'entity_id' => self::ENTITY_ID, 'bank_name' => 'Test Bank', 'account_number' => '111-000',
            'account_name' => 'Duplicate', 'coa_id' => self::COA_BANK_SPARE_ID, 'is_active' => true,
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('account_number', $result['errors']);
    }
}
