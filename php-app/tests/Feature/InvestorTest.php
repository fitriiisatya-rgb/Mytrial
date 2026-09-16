<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\InvestorRepository;
use App\Services\InvestorService;

final class InvestorTest extends TestCase
{
    /** spec R.8 / spec F: investor without login allowed */
    public function testInvestorWithoutLoginAllowed(): void
    {
        $result = (new InvestorService())->create([
            'code' => 'INV-NEW', 'full_name' => 'New Investor', 'email' => '', 'phone' => '', 'profile_id' => '', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertTrue($result['ok']);
        $found = (new InvestorRepository())->findById($result['id']);
        self::assertNull($found['profile_id']);
    }

    public function testInvestorWithProfileIdMustReferenceRealProfile(): void
    {
        $result = (new InvestorService())->create([
            'code' => 'INV-BAD', 'full_name' => 'Bad Link', 'email' => '', 'phone' => '',
            'profile_id' => '00000000-0000-0000-0000-000000000000', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('profile_id', $result['errors']);
    }

    public function testDuplicateInvestorCodeRejected(): void
    {
        $result = (new InvestorService())->create([
            'code' => 'INV-A', 'full_name' => 'Duplicate', 'email' => '', 'phone' => '', 'profile_id' => '', 'status' => 'active',
        ], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('code', $result['errors']);
    }
}
