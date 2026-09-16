<?php

declare(strict_types=1);

namespace App\Services;

use App\Database\Connection;
use App\Helpers\Validation;
use App\Repositories\OwnershipRepository;

/**
 * The one place spec I's ">100% must never be stored, even under
 * concurrent writes" guarantee is enforced. Every create() call runs
 * inside a single DB transaction that SELECT ... FOR UPDATE-locks every
 * ownership row overlapping the new row's date range for the same
 * outlet BEFORE summing percentages - a second, concurrent request
 * targeting the same outlet+date-range physically cannot read past that
 * lock until the first request's transaction commits or rolls back, so
 * the sum it computes always already reflects the first request's
 * write. This is what makes the guard correct under concurrency, not
 * just correct for one request at a time (a plain "check then insert"
 * without the lock would have a race window between the two).
 */
final class OwnershipService
{
    public function __construct(private readonly OwnershipRepository $repo = new OwnershipRepository())
    {
    }

    /** @param array<string, mixed> $input @return array{ok: bool, errors: array<string,string>, id?: string} */
    public function create(array $input, string $actorId): array
    {
        $errors = $this->validate($input);
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $outletId = (string) $input['outlet_id'];
        $pct = (string) $input['ownership_pct'];
        $effectiveFrom = (string) $input['effective_from'];

        try {
            $id = Connection::transaction(function (\PDO $pdo) use ($input, $outletId, $pct, $effectiveFrom, $actorId): string {
                // Locks every row for this outlet whose date range
                // overlaps [effective_from, infinity) - an open-ended
                // new row is only bounded by its own start, so it
                // overlaps every existing row that hasn't already ended
                // before effective_from.
                $overlapping = $this->repo->lockOverlappingActiveForOutlet($pdo, $outletId, $effectiveFrom, null);
                $existingTotal = array_sum(array_map(static fn (array $row): float => (float) $row['ownership_pct'], $overlapping));
                $newTotal = $existingTotal + (float) $pct;

                if ($newTotal > 100.0 + 1e-9) {
                    throw new OwnershipTotalExceededException(sprintf(
                        'Total kepemilikan untuk outlet ini pada periode yang tumpang tindih akan menjadi %s%%, melebihi 100%%.',
                        rtrim(rtrim(number_format($newTotal, 6, '.', ''), '0'), '.')
                    ));
                }

                $id = $this->repo->create(
                    $pdo,
                    (string) $input['investor_id'],
                    $outletId,
                    (string) $input['contract_id'],
                    $pct,
                    (string) $input['investment_amount'],
                    $effectiveFrom,
                    $actorId
                );

                AuditService::log($actorId, 'ownership_created', 'investor_ownerships', $id, null, [
                    'investor_id' => $input['investor_id'],
                    'outlet_id' => $outletId,
                    'contract_id' => $input['contract_id'],
                    'ownership_pct' => $pct,
                    'investment_amount' => $input['investment_amount'],
                    'effective_from' => $effectiveFrom,
                ]);

                return $id;
            });
        } catch (OwnershipTotalExceededException $e) {
            return ['ok' => false, 'errors' => ['ownership_pct' => $e->getMessage()]];
        }

        return ['ok' => true, 'errors' => [], 'id' => $id];
    }

    /** @param array<string, mixed> $input @return array<string, string> */
    private function validate(array $input): array
    {
        $errors = Validation::validate($input, [
            'investor_id' => 'required',
            'outlet_id' => 'required',
            'contract_id' => 'required',
            'ownership_pct' => 'required',
            'effective_from' => 'required',
        ]);

        $pct = $input['ownership_pct'] ?? null;
        if ($pct !== null && $pct !== '' && (!is_numeric($pct) || (float) $pct <= 0 || (float) $pct > 100)) {
            $errors['ownership_pct'] = 'Persentase kepemilikan harus lebih dari 0 dan maksimal 100.';
        }

        $amount = $input['investment_amount'] ?? null;
        if ($amount !== null && $amount !== '' && (!is_numeric($amount) || (float) $amount < 0)) {
            $errors['investment_amount'] = 'Nilai investasi tidak valid.';
        }

        return $errors;
    }

    /**
     * Ends an ownership row: sets effective_to + is_active=0. The row's
     * other fields (investor, outlet, pct, investment_amount) are NEVER
     * touched - this is not an edit, it is closing a historical record
     * (spec H/J: history must never be overwritten). A genuinely changed
     * ownership is "end the old row, then create() a new one" as two
     * separate actions, not a single update.
     *
     * @return array{ok: bool, errors: array<string,string>}
     */
    public function end(string $id, string $effectiveTo, string $actorId): array
    {
        $row = $this->repo->findById($id);
        if ($row === null) {
            return ['ok' => false, 'errors' => ['id' => 'Data kepemilikan tidak ditemukan.']];
        }
        if ((int) $row['is_active'] === 0) {
            return ['ok' => false, 'errors' => ['effective_to' => 'Data kepemilikan ini sudah berakhir sebelumnya.']];
        }
        if (strtotime($effectiveTo) <= strtotime((string) $row['effective_from'])) {
            return ['ok' => false, 'errors' => ['effective_to' => 'Tanggal akhir harus setelah tanggal mulai.']];
        }

        Connection::transaction(function (\PDO $pdo) use ($id, $effectiveTo, $row, $actorId): void {
            $this->repo->end($pdo, $id, $effectiveTo);
            AuditService::log($actorId, 'ownership_ended', 'investor_ownerships', $id, $row, ['effective_to' => $effectiveTo]);
        });

        return ['ok' => true, 'errors' => []];
    }
}
