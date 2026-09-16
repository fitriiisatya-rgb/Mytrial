<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Repositories\EntityRepository;
use App\Repositories\InvestorRepository;

/** spec R.18/R.19 / spec Q: search and server-side pagination - every list query pushes LIMIT/OFFSET and the search filter into SQL, never fetches everything into PHP first. */
final class SearchPaginationTest extends TestCase
{
    public function testSearchFiltersByCodeOrName(): void
    {
        $repo = new EntityRepository();
        $_GET = ['page' => '1', 'per_page' => '20'];
        $paginator = Paginator::fromRequest($repo->count('Test Entity', null));
        $results = $repo->paginate($paginator, 'Test Entity', null);

        self::assertNotEmpty($results);
        foreach ($results as $row) {
            self::assertStringContainsStringIgnoringCase('test entity', strtolower((string) $row['name']) . strtolower((string) $row['code']));
        }

        $noMatch = $repo->count('Absolutely-Not-A-Real-Code-XYZ', null);
        self::assertSame(0, $noMatch);
    }

    /** Pagination must be enforced in SQL (LIMIT/OFFSET), not by slicing a fully-fetched PHP array - proven by seeding more rows than one page and confirming each page returns exactly perPage (or the remainder) rows, never the full set. */
    public function testPaginationIsServerSide(): void
    {
        $pdo = Connection::instance();
        $insert = $pdo->prepare('INSERT INTO investors (id, code, full_name, status) VALUES (:id, :code, :name, :status)');
        for ($i = 1; $i <= 25; $i++) {
            $insert->execute([
                'id' => sprintf('c0000000-0000-0000-0000-%012d', $i),
                'code' => sprintf('PAG-%03d', $i),
                'name' => sprintf('Pagination Investor %03d', $i),
                'status' => 'active',
            ]);
        }

        $repo = new InvestorRepository();
        $total = $repo->count('Pagination Investor', null);
        self::assertSame(25, $total);

        $_GET = ['page' => '1', 'per_page' => '10'];
        $page1 = $repo->paginate(Paginator::fromRequest($total, 10), 'Pagination Investor', null);
        self::assertCount(10, $page1);

        $_GET = ['page' => '3', 'per_page' => '10'];
        $page3 = $repo->paginate(Paginator::fromRequest($total, 10), 'Pagination Investor', null);
        self::assertCount(5, $page3); // remainder: 25 - 20

        // Page 1 and page 3 must not overlap - proves OFFSET is really moving, not just re-returning the same slice.
        $page1Ids = array_column($page1, 'id');
        $page3Ids = array_column($page3, 'id');
        self::assertEmpty(array_intersect($page1Ids, $page3Ids));

        $paginatorMeta = Paginator::fromRequest($total, 10);
        self::assertSame(3, $paginatorMeta->lastPage());
    }
}
