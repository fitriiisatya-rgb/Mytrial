<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Helpers\Uuid;
use PDO;

/**
 * All SQL for investor_ownerships. Ownership is effective-dated and
 * append-only (spec H/J) - there is no update() method here on purpose;
 * a change in ownership is always "end the old row, insert a new one"
 * (see App\Services\OwnershipService), never an in-place edit of a
 * historical row.
 */
final class OwnershipRepository
{
    // "Current as of a date" is a pure date-range check - it deliberately
    // does NOT filter on is_active, mirroring the original Postgres
    // fn_ownership_as_of's own documented reasoning: is_active only
    // means "not superseded as bookkeeping stands today", not "was this
    // the row in force on the date in question." An ownership change
    // entered in advance (old row end-dated + is_active=0 the moment the
    // new row is created, even though the old row's effective_to is
    // still in the future) must keep showing as current until that
    // future end date actually arrives - see OwnershipService::change().
    //
    // PDO with ATTR_EMULATE_PREPARES=false (real server-side MySQL
    // prepares) does not allow a named placeholder to repeat within one
    // query - each occurrence needs its own name even when the bound
    // value is identical, hence :as_of_from / :as_of_to instead of two
    // uses of :as_of.
    private const CURRENT_SQL = 'effective_from <= :as_of_to AND (effective_to IS NULL OR effective_to >= :as_of_from)';

    /** Ownership rows in force on $asOfDate (default today) for one outlet - the live snapshot, not full history. */
    public function currentForOutlet(string $outletId, ?string $asOfDate = null): array
    {
        $asOf = $asOfDate ?? date('Y-m-d');
        $stmt = Connection::instance()->prepare(
            "SELECT o.*, i.full_name AS investor_name, i.code AS investor_code
             FROM investor_ownerships o
             JOIN investors i ON i.id = o.investor_id
             WHERE o.outlet_id = :outlet_id AND {$this->currentSql()}
             ORDER BY o.ownership_pct DESC"
        );
        $stmt->execute(['outlet_id' => $outletId, 'as_of_from' => $asOf, 'as_of_to' => $asOf]);
        return $stmt->fetchAll();
    }

    public function currentTotalPctForOutlet(string $outletId, ?string $asOfDate = null): float
    {
        $asOf = $asOfDate ?? date('Y-m-d');
        $stmt = Connection::instance()->prepare(
            "SELECT COALESCE(SUM(ownership_pct), 0) AS total FROM investor_ownerships
             WHERE outlet_id = :outlet_id AND {$this->currentSql()}"
        );
        $stmt->execute(['outlet_id' => $outletId, 'as_of_from' => $asOf, 'as_of_to' => $asOf]);
        $row = $stmt->fetch();
        return $row === false ? 0.0 : (float) $row['total'];
    }

    public function currentInvestorCountForOutlet(string $outletId, ?string $asOfDate = null): int
    {
        $asOf = $asOfDate ?? date('Y-m-d');
        $stmt = Connection::instance()->prepare(
            "SELECT COUNT(DISTINCT investor_id) AS c FROM investor_ownerships
             WHERE outlet_id = :outlet_id AND {$this->currentSql()}"
        );
        $stmt->execute(['outlet_id' => $outletId, 'as_of_from' => $asOf, 'as_of_to' => $asOf]);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** Full ownership history for an outlet (every row, past and present), newest first. */
    public function historyForOutlet(string $outletId): array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT o.*, i.full_name AS investor_name, i.code AS investor_code
             FROM investor_ownerships o
             JOIN investors i ON i.id = o.investor_id
             WHERE o.outlet_id = :outlet_id
             ORDER BY o.effective_from DESC, o.created_at DESC'
        );
        $stmt->execute(['outlet_id' => $outletId]);
        return $stmt->fetchAll();
    }

    public function currentForInvestor(string $investorId, ?string $asOfDate = null): array
    {
        $asOf = $asOfDate ?? date('Y-m-d');
        $stmt = Connection::instance()->prepare(
            "SELECT o.*, ot.name AS outlet_name, ot.code AS outlet_code
             FROM investor_ownerships o
             JOIN outlets ot ON ot.id = o.outlet_id
             WHERE o.investor_id = :investor_id AND {$this->currentSql()}
             ORDER BY o.effective_from DESC"
        );
        $stmt->execute(['investor_id' => $investorId, 'as_of_from' => $asOf, 'as_of_to' => $asOf]);
        return $stmt->fetchAll();
    }

    public function historyForInvestor(string $investorId): array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT o.*, ot.name AS outlet_name, ot.code AS outlet_code
             FROM investor_ownerships o
             JOIN outlets ot ON ot.id = o.outlet_id
             WHERE o.investor_id = :investor_id
             ORDER BY o.effective_from DESC, o.created_at DESC'
        );
        $stmt->execute(['investor_id' => $investorId]);
        return $stmt->fetchAll();
    }

    public function currentActiveOwnershipCountForInvestor(string $investorId, ?string $asOfDate = null): int
    {
        $asOf = $asOfDate ?? date('Y-m-d');
        $stmt = Connection::instance()->prepare(
            "SELECT COUNT(*) AS c FROM investor_ownerships
             WHERE investor_id = :investor_id AND {$this->currentSql()}"
        );
        $stmt->execute(['investor_id' => $investorId, 'as_of_from' => $asOf, 'as_of_to' => $asOf]);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** General "Kepemilikan Investor" list page - every ownership row (current and historical), filterable. @return list<array<string, mixed>> */
    public function paginate(Paginator $paginator, ?string $investorId, ?string $outletId, ?string $activeFilter): array
    {
        [$where, $params] = $this->buildListWhere($investorId, $outletId, $activeFilter);
        $stmt = Connection::instance()->prepare(
            "SELECT o.*, i.full_name AS investor_name, ot.name AS outlet_name FROM investor_ownerships o
             JOIN investors i ON i.id = o.investor_id
             JOIN outlets ot ON ot.id = o.outlet_id
             {$where} ORDER BY o.effective_from DESC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $paginator->perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countAll(?string $investorId, ?string $outletId, ?string $activeFilter): int
    {
        [$where, $params] = $this->buildListWhere($investorId, $outletId, $activeFilter);
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM investor_ownerships o {$where}");
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function buildListWhere(?string $investorId, ?string $outletId, ?string $activeFilter): array
    {
        $conditions = [];
        $params = [];
        if ($investorId !== null && $investorId !== '') {
            $conditions[] = 'o.investor_id = :investor_id';
            $params[':investor_id'] = $investorId;
        }
        if ($outletId !== null && $outletId !== '') {
            $conditions[] = 'o.outlet_id = :outlet_id';
            $params[':outlet_id'] = $outletId;
        }
        if ($activeFilter === 'active') {
            $conditions[] = 'o.is_active = 1';
        } elseif ($activeFilter === 'inactive') {
            $conditions[] = 'o.is_active = 0';
        }
        $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
        return [$where, $params];
    }

    public function findById(string $id): ?array
    {
        $stmt = Connection::instance()->prepare('SELECT * FROM investor_ownerships WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Locks every currently-active ownership row for $outletId that
     * overlaps [$effectiveFrom, $effectiveTo] (SELECT ... FOR UPDATE) -
     * MUST be called inside an already-open transaction. This is what
     * makes the >100% guard concurrency-safe (spec I): two simultaneous
     * requests both computing "current total + new pct" against the
     * same outlet cannot both proceed past this lock at once - the
     * second request blocks until the first's transaction commits or
     * rolls back, so it always sees the first's write.
     *
     * @return list<array<string, mixed>>
     */
    public function lockOverlappingActiveForOutlet(PDO $pdo, string $outletId, string $effectiveFrom, ?string $effectiveTo, ?string $excludeId = null): array
    {
        // Same reasoning as CURRENT_SQL above: the overlap check is pure
        // date-range math, not gated on is_active - an advance-dated
        // change (old row already flagged is_active=0 but its
        // effective_to still in the future) must still be counted here,
        // or the >100% guard could be silently bypassed by entering
        // changes slightly early.
        $sql = 'SELECT * FROM investor_ownerships
                WHERE outlet_id = :outlet_id
                  AND effective_from <= :to
                  AND (effective_to IS NULL OR effective_to >= :from)';
        if ($excludeId !== null) {
            $sql .= ' AND id <> :exclude_id';
        }
        $sql .= ' FOR UPDATE';

        $stmt = $pdo->prepare($sql);
        $params = [
            'outlet_id' => $outletId,
            'from' => $effectiveFrom,
            // An open-ended row (effective_to NULL) must be treated as
            // "extends to infinity" for the overlap check - MySQL has no
            // 'infinity' literal like Postgres, so a far-future sentinel
            // date does the same job.
            'to' => $effectiveTo ?? '9999-12-31',
        ];
        if ($excludeId !== null) {
            $params['exclude_id'] = $excludeId;
        }
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function create(PDO $pdo, string $investorId, string $outletId, string $contractId, string $ownershipPct, string $investmentAmount, string $effectiveFrom, ?string $createdBy): string
    {
        $id = Uuid::v4();
        $stmt = $pdo->prepare(
            'INSERT INTO investor_ownerships (id, investor_id, outlet_id, contract_id, ownership_pct, investment_amount, effective_from, effective_to, is_active, created_by)
             VALUES (:id, :investor_id, :outlet_id, :contract_id, :pct, :amount, :from, NULL, 1, :created_by)'
        );
        $stmt->execute([
            'id' => $id, 'investor_id' => $investorId, 'outlet_id' => $outletId, 'contract_id' => $contractId,
            'pct' => $ownershipPct, 'amount' => $investmentAmount, 'from' => $effectiveFrom, 'created_by' => $createdBy,
        ]);
        return $id;
    }

    /** Ends a row (sets effective_to + is_active=0) - the ONLY mutation ever applied to an existing ownership row; its other fields never change. */
    public function end(PDO $pdo, string $id, string $effectiveTo): void
    {
        $stmt = $pdo->prepare('UPDATE investor_ownerships SET effective_to = :to, is_active = 0 WHERE id = :id');
        $stmt->execute(['to' => $effectiveTo, 'id' => $id]);
    }

    private function currentSql(): string
    {
        return self::CURRENT_SQL;
    }
}
