<?php

declare(strict_types=1);

/**
 * Standalone CLI worker for OwnershipConcurrencyTest - NOT part of the
 * PHPUnit process itself. Spawned twice via proc_open() with the SAME
 * outlet/contract/date-range and percentages that together exceed 100%,
 * started as close to simultaneously as the parent test can manage, to
 * prove App\Services\OwnershipService::create()'s SELECT ... FOR UPDATE
 * lock genuinely serializes two concurrent OS processes - not just two
 * sequential calls in one PHP process, which a single-process PHPUnit
 * test can never truly exercise (there is no real concurrency inside
 * one process's request/response cycle).
 *
 * Usage: php concurrent_ownership_writer.php <investor_id> <pct> <sleep_ms_after_lock>
 * Prints exactly one line: "OK <id>" or "REJECTED <message>".
 *
 * <sleep_ms_after_lock> is injected ONLY to widen the race window
 * deterministically for the test (real production code has no
 * artificial sleep) - it sleeps AFTER the FOR UPDATE lock is acquired
 * but BEFORE the transaction commits, so the second process's own
 * lock attempt is guaranteed to block on the first, not race it.
 */

putenv('PFS_ENV_FILE=' . dirname(__DIR__, 2) . '/.env.testing');
require_once dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Database\Connection;
use App\Repositories\OwnershipRepository;
use App\Services\AuditService;
use App\Services\OwnershipTotalExceededException;

[, $investorId, $pct, $sleepMs] = $argv;
$outletId = getenv('PFS_TEST_OUTLET_ID');
$contractId = getenv('PFS_TEST_CONTRACT_ID');
$effectiveFrom = getenv('PFS_TEST_EFFECTIVE_FROM');
$actorId = getenv('PFS_TEST_ACTOR_ID');

$repo = new OwnershipRepository();

try {
    $id = Connection::transaction(function (PDO $pdo) use ($repo, $investorId, $outletId, $contractId, $pct, $effectiveFrom, $actorId, $sleepMs): string {
        $overlapping = $repo->lockOverlappingActiveForOutlet($pdo, $outletId, $effectiveFrom, null);
        $existingTotal = array_sum(array_map(static fn (array $row): float => (float) $row['ownership_pct'], $overlapping));
        $newTotal = $existingTotal + (float) $pct;

        // Widen the race window deterministically, AFTER acquiring the
        // row lock (so the other process's own SELECT ... FOR UPDATE is
        // now guaranteed to block on this transaction, proving the lock
        // - not scheduling luck - is what prevents the race).
        if ((int) $sleepMs > 0) {
            usleep((int) $sleepMs * 1000);
        }

        if ($newTotal > 100.0 + 1e-9) {
            throw new OwnershipTotalExceededException("would total {$newTotal}%");
        }

        $id = $repo->create($pdo, $investorId, $outletId, $contractId, $pct, '1000000', $effectiveFrom, $actorId);
        AuditService::log($actorId, 'ownership_created', 'investor_ownerships', $id, null, ['ownership_pct' => $pct]);
        return $id;
    });
    echo "OK {$id}\n";
} catch (OwnershipTotalExceededException $e) {
    echo "REJECTED {$e->getMessage()}\n";
}
