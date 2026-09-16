<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Database\Connection;
use App\Helpers\Paginator;
use App\Helpers\Uuid;

final class ContractRepository
{
    /** @return list<array<string, mixed>> */
    public function paginate(Paginator $paginator, ?string $search, ?string $status, ?string $outletId): array
    {
        [$where, $params] = $this->buildWhere($search, $status, $outletId);
        $stmt = Connection::instance()->prepare(
            "SELECT c.*, o.name AS outlet_name, o.code AS outlet_code FROM partnership_contracts c
             JOIN outlets o ON o.id = c.outlet_id
             {$where} ORDER BY c.start_date DESC LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $paginator->perPage, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $paginator->offset(), \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function count(?string $search, ?string $status, ?string $outletId): int
    {
        [$where, $params] = $this->buildWhere($search, $status, $outletId);
        $stmt = Connection::instance()->prepare("SELECT COUNT(*) AS c FROM partnership_contracts c {$where}");
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? 0 : (int) $row['c'];
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function buildWhere(?string $search, ?string $status, ?string $outletId): array
    {
        $conditions = [];
        $params = [];
        if ($search !== null && $search !== '') {
            $conditions[] = 'c.contract_number LIKE :search';
            $params[':search'] = '%' . $search . '%';
        }
        if ($status !== null && $status !== '') {
            $conditions[] = 'c.status = :status';
            $params[':status'] = $status;
        }
        if ($outletId !== null && $outletId !== '') {
            $conditions[] = 'c.outlet_id = :outlet_id';
            $params[':outlet_id'] = $outletId;
        }
        $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
        return [$where, $params];
    }

    public function findById(string $id): ?array
    {
        $stmt = Connection::instance()->prepare(
            'SELECT c.*, o.name AS outlet_name, o.code AS outlet_code FROM partnership_contracts c
             JOIN outlets o ON o.id = c.outlet_id WHERE c.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findByContractNumber(string $contractNumber): ?array
    {
        $stmt = Connection::instance()->prepare('SELECT * FROM partnership_contracts WHERE contract_number = :n LIMIT 1');
        $stmt->execute(['n' => $contractNumber]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string, mixed>> active contracts for one outlet, for the Ownership form's contract dropdown */
    public function listActiveForOutlet(string $outletId): array
    {
        $stmt = Connection::instance()->prepare(
            "SELECT id, contract_number FROM partnership_contracts WHERE outlet_id = :outlet_id AND status = 'active' ORDER BY start_date DESC"
        );
        $stmt->execute(['outlet_id' => $outletId]);
        return $stmt->fetchAll();
    }

    /** @return list<array<string, mixed>> every active contract with its outlet_id - used to client-side filter the Ownership form's contract dropdown as the outlet selection changes, without a server round trip. */
    public function listAllActiveWithOutlet(): array
    {
        $stmt = Connection::instance()->query("SELECT id, contract_number, outlet_id FROM partnership_contracts WHERE status = 'active' ORDER BY contract_number ASC");
        return $stmt->fetchAll();
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): string
    {
        $id = Uuid::v4();
        $stmt = Connection::instance()->prepare(
            'INSERT INTO partnership_contracts (id, outlet_id, contract_number, start_date, end_date, duration_months, total_investment, profit_distribution_pct, status)
             VALUES (:id, :outlet_id, :contract_number, :start_date, :end_date, :duration_months, :total_investment, :pct, :status)'
        );
        $stmt->execute([
            'id' => $id,
            'outlet_id' => $data['outlet_id'],
            'contract_number' => $data['contract_number'],
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
            'duration_months' => $data['duration_months'] !== '' ? $data['duration_months'] : null,
            'total_investment' => $data['total_investment'],
            'pct' => $data['profit_distribution_pct'],
            'status' => $data['status'],
        ]);
        return $id;
    }

    /** @param array<string, mixed> $data */
    public function update(string $id, array $data): void
    {
        $stmt = Connection::instance()->prepare(
            'UPDATE partnership_contracts SET outlet_id = :outlet_id, contract_number = :contract_number, start_date = :start_date,
               end_date = :end_date, duration_months = :duration_months, total_investment = :total_investment,
               profit_distribution_pct = :pct, status = :status
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'outlet_id' => $data['outlet_id'],
            'contract_number' => $data['contract_number'],
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
            'duration_months' => $data['duration_months'] !== '' ? $data['duration_months'] : null,
            'total_investment' => $data['total_investment'],
            'pct' => $data['profit_distribution_pct'],
            'status' => $data['status'],
        ]);
    }
}
