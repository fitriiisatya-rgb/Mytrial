<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\ContractRepository;
use App\Repositories\OutletRepository;
use App\Services\ContractService;

final class ContractController extends Controller
{
    public function index(): void
    {
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : null;
        $status = isset($_GET['status']) && $_GET['status'] !== '' ? (string) $_GET['status'] : null;
        $outletId = isset($_GET['outlet_id']) && $_GET['outlet_id'] !== '' ? (string) $_GET['outlet_id'] : null;

        $repo = new ContractRepository();
        $total = $repo->count($search, $status, $outletId);
        $paginator = Paginator::fromRequest($total);
        $contracts = $repo->paginate($paginator, $search, $status, $outletId);

        $this->viewWithLayout('master/contracts/index', 'Kontrak Kemitraan', 'contracts', [
            'contracts' => $contracts,
            'paginator' => $paginator,
            'search' => $search ?? '',
            'status' => $status ?? '',
            'outletId' => $outletId ?? '',
            'outlets' => (new OutletRepository())->listActive(),
        ]);
    }

    public function create(): void
    {
        $this->viewWithLayout('master/contracts/form', 'Tambah Kontrak', 'contracts', [
            'contract' => null, 'errors' => [], 'old' => [], 'outlets' => (new OutletRepository())->listActive(),
        ]);
    }

    public function store(): void
    {
        $input = $this->readInput();
        $result = (new ContractService())->create($input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $this->viewWithLayout('master/contracts/form', 'Tambah Kontrak', 'contracts', [
                'contract' => null, 'errors' => $result['errors'], 'old' => $input, 'outlets' => (new OutletRepository())->listActive(),
            ]);
            return;
        }

        Flash::set('success', 'Kontrak berhasil dibuat.');
        $this->redirect('/master/contracts');
    }

    public function show(array $params): void
    {
        $contract = (new ContractRepository())->findById($params['id']);
        if ($contract === null) {
            throw new HttpException(404, 'Kontrak tidak ditemukan');
        }
        $this->viewWithLayout('master/contracts/show', 'Detail Kontrak', 'contracts', ['contract' => $contract]);
    }

    public function edit(array $params): void
    {
        $contract = (new ContractRepository())->findById($params['id']);
        if ($contract === null) {
            throw new HttpException(404, 'Kontrak tidak ditemukan');
        }
        $this->viewWithLayout('master/contracts/form', 'Edit Kontrak', 'contracts', [
            'contract' => $contract, 'errors' => [], 'old' => $contract, 'outlets' => (new OutletRepository())->listActive(),
        ]);
    }

    public function update(array $params): void
    {
        $input = $this->readInput();
        $result = (new ContractService())->update($params['id'], $input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $contract = (new ContractRepository())->findById($params['id']);
            $this->viewWithLayout('master/contracts/form', 'Edit Kontrak', 'contracts', [
                'contract' => $contract, 'errors' => $result['errors'], 'old' => $input + ['id' => $params['id']], 'outlets' => (new OutletRepository())->listActive(),
            ]);
            return;
        }

        Flash::set('success', 'Kontrak berhasil diperbarui.');
        $this->redirect('/master/contracts/' . $params['id']);
    }

    /** @return array<string, mixed> */
    private function readInput(): array
    {
        return [
            'outlet_id' => $this->input('outlet_id', ''),
            'contract_number' => $this->input('contract_number', ''),
            'start_date' => $this->input('start_date', ''),
            'end_date' => $this->input('end_date', ''),
            'duration_months' => $this->input('duration_months', ''),
            'total_investment' => $this->input('total_investment', '0'),
            'profit_distribution_pct' => $this->input('profit_distribution_pct', ''),
            'status' => $this->input('status', 'active'),
        ];
    }
}
