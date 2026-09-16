<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\ContractRepository;
use App\Repositories\InvestorRepository;
use App\Repositories\OutletRepository;
use App\Repositories\OwnershipRepository;
use App\Services\OwnershipService;

final class OwnershipController extends Controller
{
    public function index(): void
    {
        $investorId = isset($_GET['investor_id']) && $_GET['investor_id'] !== '' ? (string) $_GET['investor_id'] : null;
        $outletId = isset($_GET['outlet_id']) && $_GET['outlet_id'] !== '' ? (string) $_GET['outlet_id'] : null;
        $status = isset($_GET['status']) && $_GET['status'] !== '' ? (string) $_GET['status'] : null;

        $repo = new OwnershipRepository();
        $total = $repo->countAll($investorId, $outletId, $status);
        $paginator = Paginator::fromRequest($total);
        $ownerships = $repo->paginate($paginator, $investorId, $outletId, $status);

        $this->viewWithLayout('master/ownerships/index', 'Kepemilikan Investor', 'ownerships', [
            'ownerships' => $ownerships,
            'paginator' => $paginator,
            'investorId' => $investorId ?? '',
            'outletId' => $outletId ?? '',
            'status' => $status ?? '',
            'investors' => (new InvestorRepository())->listActive(),
            'outlets' => (new OutletRepository())->listActive(),
        ]);
    }

    public function create(): void
    {
        $outletId = isset($_GET['outlet_id']) ? (string) $_GET['outlet_id'] : '';
        $this->viewWithLayout('master/ownerships/form', 'Tambah Kepemilikan', 'ownerships', [
            'errors' => [], 'old' => ['outlet_id' => $outletId],
            'investors' => (new InvestorRepository())->listActive(),
            'outlets' => (new OutletRepository())->listActive(),
            'allContracts' => (new ContractRepository())->listAllActiveWithOutlet(),
        ]);
    }

    public function store(): void
    {
        $input = [
            'investor_id' => $this->input('investor_id', ''),
            'outlet_id' => $this->input('outlet_id', ''),
            'contract_id' => $this->input('contract_id', ''),
            'ownership_pct' => $this->input('ownership_pct', ''),
            'investment_amount' => $this->input('investment_amount', '0'),
            'effective_from' => $this->input('effective_from', ''),
        ];
        $result = (new OwnershipService())->create($input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $this->viewWithLayout('master/ownerships/form', 'Tambah Kepemilikan', 'ownerships', [
                'errors' => $result['errors'], 'old' => $input,
                'investors' => (new InvestorRepository())->listActive(),
                'outlets' => (new OutletRepository())->listActive(),
                'allContracts' => (new ContractRepository())->listAllActiveWithOutlet(),
            ]);
            return;
        }

        Flash::set('success', 'Kepemilikan berhasil dicatat.');
        $this->redirect('/master/outlets/' . $input['outlet_id']);
    }

    public function endForm(array $params): void
    {
        $ownership = (new OwnershipRepository())->findById($params['id']);
        if ($ownership === null) {
            throw new HttpException(404, 'Data kepemilikan tidak ditemukan');
        }
        $this->viewWithLayout('master/ownerships/end', 'Akhiri Kepemilikan', 'ownerships', [
            'ownership' => $ownership, 'errors' => [],
        ]);
    }

    public function end(array $params): void
    {
        $effectiveTo = $this->input('effective_to', '');
        $result = (new OwnershipService())->end($params['id'], $effectiveTo, $this->currentUser()['id']);

        if (!$result['ok']) {
            $ownership = (new OwnershipRepository())->findById($params['id']);
            $this->viewWithLayout('master/ownerships/end', 'Akhiri Kepemilikan', 'ownerships', [
                'ownership' => $ownership, 'errors' => $result['errors'],
            ]);
            return;
        }

        Flash::set('success', 'Kepemilikan berhasil diakhiri.');
        $ownership = (new OwnershipRepository())->findById($params['id']);
        $this->redirect('/master/outlets/' . ($ownership['outlet_id'] ?? ''));
    }
}
