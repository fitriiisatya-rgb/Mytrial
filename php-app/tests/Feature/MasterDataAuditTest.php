<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Database\Connection;
use App\Services\CoaService;
use App\Services\EntityService;
use App\Services\OwnershipService;

/** spec R.17 / spec M: audit created for every listed critical Master Data action, with actor + before/after captured. */
final class MasterDataAuditTest extends TestCase
{
    public function testEntityCreateAndUpdateBothAudited(): void
    {
        $service = new EntityService();
        $created = $service->create(['code' => 'AUD1', 'name' => 'Audit Co', 'status' => 'active'], self::ACCOUNTING_ID);
        self::assertTrue($created['ok']);

        $service->update($created['id'], ['code' => 'AUD1', 'name' => 'Audit Co Renamed', 'status' => 'active'], self::FINANCE_MANAGER_ID);

        $rows = $this->auditRowsFor('entities', $created['id']);
        self::assertCount(2, $rows);

        $createRow = $rows[0];
        self::assertSame('entity_created', $createRow['action']);
        self::assertSame(self::ACCOUNTING_ID, $createRow['user_id']);
        self::assertNull($createRow['old_value']);
        self::assertStringContainsString('Audit Co', (string) $createRow['new_value']);

        $updateRow = $rows[1];
        self::assertSame('entity_updated', $updateRow['action']);
        self::assertSame(self::FINANCE_MANAGER_ID, $updateRow['user_id']);
        self::assertStringContainsString('Audit Co', (string) $updateRow['old_value']);
        self::assertStringContainsString('Renamed', (string) $updateRow['new_value']);
    }

    public function testCoaCreateAudited(): void
    {
        $result = (new CoaService())->create([
            'code' => '777000', 'name' => 'Audited Account', 'account_type' => 'expense', 'parent_id' => '',
            'normal_balance' => 'debit', 'pnl_category' => '', 'reporting_order' => '0', 'is_active' => true,
        ], self::ACCOUNTING_ID);

        $rows = $this->auditRowsFor('coa', $result['id']);
        self::assertCount(1, $rows);
        self::assertSame('coa_created', $rows[0]['action']);
    }

    /** spec M explicitly lists both "create ownership" and "close/end ownership" as audited actions. */
    public function testOwnershipCreateAndEndBothAudited(): void
    {
        $service = new OwnershipService();
        $created = $service->create([
            'investor_id' => self::INVESTOR_A_ID, 'outlet_id' => self::OUTLET_A_ID, 'contract_id' => self::CONTRACT_A_ID,
            'ownership_pct' => '50', 'investment_amount' => '1000000', 'effective_from' => '2024-01-01',
        ], self::ACCOUNTING_ID);
        self::assertTrue($created['ok']);
        self::assertSame(1, count($this->auditRowsFor('investor_ownerships', $created['id'])));

        $service->end($created['id'], '2024-12-31', self::FINANCE_MANAGER_ID);

        $rows = $this->auditRowsFor('investor_ownerships', $created['id']);
        self::assertCount(2, $rows);
        self::assertSame('ownership_created', $rows[0]['action']);
        self::assertSame('ownership_ended', $rows[1]['action']);
        self::assertSame(self::FINANCE_MANAGER_ID, $rows[1]['user_id']);
    }

    /** @return list<array<string, mixed>> */
    private function auditRowsFor(string $table, string $entityId): array
    {
        // created_at is DATETIME(6) (microsecond precision - see the fix
        // at the top of database/schema/0002_master_data.sql), so this
        // ordering is reliable even for two rows written within the same
        // request; audit_log.id is a UUID and carries no chronological
        // order, so it is deliberately not used as a tiebreaker.
        $stmt = Connection::instance()->prepare(
            'SELECT * FROM audit_log WHERE entity_table = :t AND entity_id = :id ORDER BY created_at ASC'
        );
        $stmt->execute(['t' => $table, 'id' => $entityId]);
        return $stmt->fetchAll();
    }
}
