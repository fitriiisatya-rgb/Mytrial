<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\EntityRepository;
use App\Services\EntityService;

final class EntityTest extends TestCase
{
    /** spec R.1: create entity success */
    public function testCreateEntitySuccess(): void
    {
        $result = (new EntityService())->create(['code' => 'NEWENT', 'name' => 'New Entity', 'status' => 'active'], self::ACCOUNTING_ID);

        self::assertTrue($result['ok']);
        $found = (new EntityRepository())->findById($result['id']);
        self::assertNotNull($found);
        self::assertSame('NEWENT', $found['code']);
        self::assertSame(1, $this->countAuditLogs('entity_created'));
    }

    /** spec R.2: duplicate entity code rejected */
    public function testDuplicateEntityCodeRejected(): void
    {
        $result = (new EntityService())->create(['code' => 'TSTENT', 'name' => 'Duplicate of seeded entity', 'status' => 'active'], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('code', $result['errors']);
    }

    public function testDuplicateCodeAlsoRejectedOnUpdateAgainstAnotherRow(): void
    {
        $first = (new EntityService())->create(['code' => 'ENT-X', 'name' => 'X', 'status' => 'active'], self::ACCOUNTING_ID);
        self::assertTrue($first['ok']);

        $result = (new EntityService())->update(self::ENTITY_ID, ['code' => 'ENT-X', 'name' => 'Test Entity', 'status' => 'active'], self::ACCOUNTING_ID);

        self::assertFalse($result['ok']);
        self::assertArrayHasKey('code', $result['errors']);
    }
}
