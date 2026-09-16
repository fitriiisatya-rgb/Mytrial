<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\OwnershipRepository;
use App\Services\OwnershipService;

final class OwnershipTest extends TestCase
{
    private function baseInput(string $investorId, string $pct, string $effectiveFrom): array
    {
        return [
            'investor_id' => $investorId, 'outlet_id' => self::OUTLET_A_ID, 'contract_id' => self::CONTRACT_A_ID,
            'ownership_pct' => $pct, 'investment_amount' => '10000000', 'effective_from' => $effectiveFrom,
        ];
    }

    /** spec R.10: ownership <=100% success */
    public function testOwnershipUpTo100PercentSucceeds(): void
    {
        $service = new OwnershipService();
        $r1 = $service->create($this->baseInput(self::INVESTOR_A_ID, '60', '2024-01-01'), self::ACCOUNTING_ID);
        self::assertTrue($r1['ok']);

        $r2 = $service->create($this->baseInput(self::INVESTOR_B_ID, '40', '2024-01-01'), self::ACCOUNTING_ID);
        self::assertTrue($r2['ok']); // 60 + 40 = exactly 100

        $total = (new OwnershipRepository())->currentTotalPctForOutlet(self::OUTLET_A_ID, '2024-06-01');
        self::assertEqualsWithDelta(100.0, $total, 0.0001);
    }

    /** spec R.11 / spec I: ownership >100% rejected */
    public function testOwnershipOver100PercentRejected(): void
    {
        $service = new OwnershipService();
        $r1 = $service->create($this->baseInput(self::INVESTOR_A_ID, '60', '2024-01-01'), self::ACCOUNTING_ID);
        self::assertTrue($r1['ok']);

        $r2 = $service->create($this->baseInput(self::INVESTOR_B_ID, '50', '2024-01-01'), self::ACCOUNTING_ID);
        self::assertFalse($r2['ok']); // 60 + 50 = 110
        self::assertArrayHasKey('ownership_pct', $r2['errors']);

        // The rejected attempt must not have been partially written.
        $total = (new OwnershipRepository())->currentTotalPctForOutlet(self::OUTLET_A_ID, '2024-06-01');
        self::assertEqualsWithDelta(60.0, $total, 0.0001);
    }

    /** Non-overlapping periods at the same outlet are independent - 60% now and a later, separate 60% after the first has ended is fine (never simultaneously >100%). */
    public function testNonOverlappingPeriodsDoNotConflict(): void
    {
        $service = new OwnershipService();
        $r1 = $service->create($this->baseInput(self::INVESTOR_A_ID, '60', '2024-01-01'), self::ACCOUNTING_ID);
        self::assertTrue($r1['ok']);

        $end = $service->end($r1['id'], '2024-12-31', self::ACCOUNTING_ID);
        self::assertTrue($end['ok']);

        $r2 = $service->create($this->baseInput(self::INVESTOR_B_ID, '60', '2025-01-01'), self::ACCOUNTING_ID);
        self::assertTrue($r2['ok']);
    }

    /** spec R.12 / spec J: historical ownership not overwritten - ending a row only sets effective_to/is_active, every other field (incl. the id) is untouched, and the row is never deleted. */
    public function testHistoricalOwnershipNotOverwritten(): void
    {
        $service = new OwnershipService();
        $created = $service->create($this->baseInput(self::INVESTOR_A_ID, '60', '2024-01-01'), self::ACCOUNTING_ID);
        self::assertTrue($created['ok']);

        $repo = new OwnershipRepository();
        $before = $repo->findById($created['id']);

        $ended = $service->end($created['id'], '2025-06-30', self::ACCOUNTING_ID);
        self::assertTrue($ended['ok']);

        $after = $repo->findById($created['id']);
        self::assertNotNull($after);
        self::assertSame($before['id'], $after['id']);
        self::assertSame($before['investor_id'], $after['investor_id']);
        self::assertSame($before['ownership_pct'], $after['ownership_pct']);
        self::assertSame($before['effective_from'], $after['effective_from']);
        self::assertSame('2025-06-30', $after['effective_to']);
        self::assertSame(0, (int) $after['is_active']);

        // A "change" is always create() a new row, never mutating the old one further.
        $changed = $service->create($this->baseInput(self::INVESTOR_A_ID, '45', '2025-07-01'), self::ACCOUNTING_ID);
        self::assertTrue($changed['ok']);
        self::assertNotSame($created['id'], $changed['id']);

        // The original historical row must still exist, completely unchanged, after the new one is created.
        $stillThere = $repo->findById($created['id']);
        self::assertSame($after, $stillThere);
    }

    public function testEndingAnAlreadyEndedRowIsRejected(): void
    {
        $service = new OwnershipService();
        $created = $service->create($this->baseInput(self::INVESTOR_A_ID, '60', '2024-01-01'), self::ACCOUNTING_ID);
        $service->end($created['id'], '2024-12-31', self::ACCOUNTING_ID);

        $result = $service->end($created['id'], '2025-01-15', self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
    }

    /** spec R.14: deactivate does not delete history - ending an ownership row (the closest Phase 2 concept to "deactivate" for this table) leaves the row queryable in history, never removed. */
    public function testEndingOwnershipDoesNotDeleteHistory(): void
    {
        $service = new OwnershipService();
        $created = $service->create($this->baseInput(self::INVESTOR_A_ID, '60', '2024-01-01'), self::ACCOUNTING_ID);
        $service->end($created['id'], '2024-12-31', self::ACCOUNTING_ID);

        $history = (new OwnershipRepository())->historyForOutlet(self::OUTLET_A_ID);
        $ids = array_column($history, 'id');
        self::assertContains($created['id'], $ids);
    }

    public function testZeroOrNegativePctRejected(): void
    {
        $result = (new OwnershipService())->create($this->baseInput(self::INVESTOR_A_ID, '0', '2024-01-01'), self::ACCOUNTING_ID);
        self::assertFalse($result['ok']);
        self::assertArrayHasKey('ownership_pct', $result['errors']);
    }
}
