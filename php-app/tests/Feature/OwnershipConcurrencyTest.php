<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Repositories\OwnershipRepository;

/**
 * spec R.13 / spec I: concurrent ownership write cannot exceed 100%.
 *
 * A single PHPUnit process cannot exercise real concurrency (there is
 * only one PHP execution thread), so this test spawns two ACTUAL
 * separate OS processes (tests/Fixtures/concurrent_ownership_writer.php)
 * against the same MySQL test database, both targeting the same outlet
 * with percentages that together exceed 100%. Process A acquires its
 * SELECT ... FOR UPDATE lock and then deliberately sleeps before
 * committing; Process B is started shortly after and can only acquire
 * its own lock once A's transaction ends - at which point it correctly
 * sees A's already-committed total and is rejected. This proves the
 * lock itself serializes the two real processes, not just two
 * sequential calls that happened to run one after another in-process.
 */
final class OwnershipConcurrencyTest extends TestCase
{
    public function testConcurrentWritesCannotExceed100Percent(): void
    {
        $env = [
            'PFS_TEST_OUTLET_ID' => self::OUTLET_A_ID,
            'PFS_TEST_CONTRACT_ID' => self::CONTRACT_A_ID,
            'PFS_TEST_EFFECTIVE_FROM' => '2024-01-01',
            'PFS_TEST_ACTOR_ID' => self::ACCOUNTING_ID,
            // proc_open() replaces the child's entire environment with
            // exactly this array (it does not inherit the parent's) -
            // PATH must be passed through explicitly or the shell
            // spawned to exec the php binary can fail to resolve it.
            'PATH' => getenv('PATH') ?: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        ];
        $script = dirname(__DIR__) . '/Fixtures/concurrent_ownership_writer.php';
        $phpBinary = PHP_BINARY !== '' ? PHP_BINARY : 'php';

        // Process A: 60%, holds its lock for 600ms after acquiring it -
        // wide enough that Process B (started 150ms later) is certain
        // to be blocked waiting on the same outlet's lock, not merely
        // racing to start first.
        $procA = proc_open(
            [$phpBinary, $script, self::INVESTOR_A_ID, '60', '600'],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipesA,
            null,
            $env
        );
        self::assertIsResource($procA);

        usleep(150_000);

        // Process B: 60% too - 60 + 60 = 120%, must be rejected once it
        // finally reads (after A commits) that 60% is already taken.
        $procB = proc_open(
            [$phpBinary, $script, self::INVESTOR_B_ID, '60', '0'],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipesB,
            null,
            $env
        );
        self::assertIsResource($procB);

        $outA = stream_get_contents($pipesA[1]);
        $errA = stream_get_contents($pipesA[2]);
        fclose($pipesA[1]);
        fclose($pipesA[2]);
        $exitA = proc_close($procA);

        $outB = stream_get_contents($pipesB[1]);
        $errB = stream_get_contents($pipesB[2]);
        fclose($pipesB[1]);
        fclose($pipesB[2]);
        $exitB = proc_close($procB);

        self::assertSame(0, $exitA, "Process A crashed: {$errA}");
        self::assertSame(0, $exitB, "Process B crashed: {$errB}");

        $outA = trim($outA);
        $outB = trim($outB);

        // Exactly one OK, exactly one REJECTED - never both OK (which
        // would mean the guard failed under concurrency), never both
        // REJECTED (which would mean the lock over-serialized and
        // rejected a legitimately fine pair).
        $results = [$outA, $outB];
        $okCount = count(array_filter($results, static fn (string $r): bool => str_starts_with($r, 'OK')));
        $rejectedCount = count(array_filter($results, static fn (string $r): bool => str_starts_with($r, 'REJECTED')));

        self::assertSame(1, $okCount, "Expected exactly one process to succeed. A: {$outA} | B: {$outB}");
        self::assertSame(1, $rejectedCount, "Expected exactly one process to be rejected. A: {$outA} | B: {$outB}");

        // The definitive check: read the real, final state back from
        // the database - total for the outlet must be exactly 60%,
        // never 120%, no matter which process "won".
        $total = (new OwnershipRepository())->currentTotalPctForOutlet(self::OUTLET_A_ID, '2024-06-01');
        self::assertEqualsWithDelta(60.0, $total, 0.0001, "Total ownership after concurrent writes was {$total}% - must never exceed 100%, and here must be exactly 60% since one write was rejected.");
    }
}
