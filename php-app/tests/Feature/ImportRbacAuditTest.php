<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Helpers\HttpException;
use App\Middleware\PolicyMiddleware;
use App\Middleware\RoleMiddleware;
use App\Services\Import\BankImportPipeline;

/** spec X: investor denied all import access entirely; management read-only; audit is batch-level, never per-row. */
final class ImportRbacAuditTest extends TestCase
{
    private const STAFF_ROLES = ['super_admin', 'accounting', 'finance_manager', 'management'];

    public function testInvestorDeniedEveryImportRoute(): void
    {
        $this->loginAs(self::INVESTOR_ID, 'investor');
        $middleware = new RoleMiddleware(self::STAFF_ROLES);

        try {
            $middleware->handle();
            self::fail('investor was NOT denied access to the import route role gate');
        } catch (HttpException $e) {
            self::assertSame(403, $e->statusCode());
        }
    }

    public function testManagementDeniedImportWriteButAccountingAllowed(): void
    {
        $this->loginAs(self::MANAGEMENT_ID, 'management');
        try {
            (new PolicyMiddleware('import.write'))->handle();
            self::fail('management was NOT denied import.write');
        } catch (HttpException $e) {
            self::assertSame(403, $e->statusCode());
        }

        try {
            (new PolicyMiddleware('import.sources.write'))->handle();
            self::fail('management was NOT denied import.sources.write');
        } catch (HttpException $e) {
            self::assertSame(403, $e->statusCode());
        }

        $this->loginAs(self::ACCOUNTING_ID, 'accounting');
        (new PolicyMiddleware('import.write'))->handle(); // must not throw
        (new PolicyMiddleware('import.sources.write'))->handle(); // must not throw
        self::assertTrue(true);
    }

    /** spec: audit is at the BATCH level, never one row per import row - a 10-row import produces exactly one audit_log entry, not ten. */
    public function testImportProducesExactlyOneBatchLevelAuditEntryNeverPerRow(): void
    {
        $before = $this->countAuditLogs('import_batch_completed');

        $result = (new BankImportPipeline())->commit(
            dirname(__DIR__) . '/Fixtures/bank_expense_sanitized.csv', 'bank_expense_sanitized.csv', null, null,
            self::ENTITY_ID, self::ACCOUNTING_ID, null, null
        );

        self::assertTrue($result['ok'], $result['error'] ?? '');
        self::assertGreaterThan(1, $result['stats']['total_rows'], 'sanity check: the fixture has multiple rows');
        self::assertSame($before + 1, $this->countAuditLogs('import_batch_completed'), 'exactly one audit entry per completed batch, regardless of row count');
    }
}
