<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\EntityRepository;
use App\Repositories\OwnershipRepository;
use App\Repositories\OutletRepository;
use App\Services\OutletService;

final class OutletController extends Controller
{
    public function index(): void
    {
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : null;
        $status = isset($_GET['status']) && $_GET['status'] !== '' ? (string) $_GET['status'] : null;
        $entityId = isset($_GET['entity_id']) && $_GET['entity_id'] !== '' ? (string) $_GET['entity_id'] : null;

        $repo = new OutletRepository();
        $total = $repo->count($search, $status, $entityId);
        $paginator = Paginator::fromRequest($total);
        $outlets = $repo->paginate($paginator, $search, $status, $entityId);

        $ownershipRepo = new OwnershipRepository();
        foreach ($outlets as &$outlet) {
            $outlet['ownership_total'] = $ownershipRepo->currentTotalPctForOutlet($outlet['id']);
            $outlet['ownership_indicator'] = OutletService::ownershipIndicator($outlet['ownership_total']);
        }
        unset($outlet);

        $this->viewWithLayout('master/outlets/index', 'Outlet', 'outlets', [
            'outlets' => $outlets,
            'paginator' => $paginator,
            'search' => $search ?? '',
            'status' => $status ?? '',
            'entityId' => $entityId ?? '',
            'entities' => (new EntityRepository())->listActive(),
        ]);
    }

    public function create(): void
    {
        $this->viewWithLayout('master/outlets/form', 'Tambah Outlet', 'outlets', [
            'outlet' => null, 'errors' => [], 'old' => [], 'entities' => (new EntityRepository())->listActive(),
        ]);
    }

    public function store(): void
    {
        $input = $this->readInput();
        $result = (new OutletService())->create($input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $this->viewWithLayout('master/outlets/form', 'Tambah Outlet', 'outlets', [
                'outlet' => null, 'errors' => $result['errors'], 'old' => $input, 'entities' => (new EntityRepository())->listActive(),
            ]);
            return;
        }

        Flash::set('success', 'Outlet berhasil dibuat.');
        $this->redirect('/master/outlets');
    }

    public function show(array $params): void
    {
        $repo = new OutletRepository();
        $outlet = $repo->findById($params['id']);
        if ($outlet === null) {
            throw new HttpException(404, 'Outlet tidak ditemukan');
        }

        $ownershipRepo = new OwnershipRepository();
        $currentOwnership = $ownershipRepo->currentForOutlet($outlet['id']);
        $totalPct = $ownershipRepo->currentTotalPctForOutlet($outlet['id']);

        $this->viewWithLayout('master/outlets/show', 'Detail Outlet', 'outlets', [
            'outlet' => $outlet,
            'currentOwnership' => $currentOwnership,
            'totalPct' => $totalPct,
            'indicator' => OutletService::ownershipIndicator($totalPct),
            'history' => $ownershipRepo->historyForOutlet($outlet['id']),
        ]);
    }

    public function edit(array $params): void
    {
        $outlet = (new OutletRepository())->findById($params['id']);
        if ($outlet === null) {
            throw new HttpException(404, 'Outlet tidak ditemukan');
        }
        $this->viewWithLayout('master/outlets/form', 'Edit Outlet', 'outlets', [
            'outlet' => $outlet, 'errors' => [], 'old' => $outlet, 'entities' => (new EntityRepository())->listActive(),
        ]);
    }

    public function update(array $params): void
    {
        $input = $this->readInput();
        $result = (new OutletService())->update($params['id'], $input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $outlet = (new OutletRepository())->findById($params['id']);
            $this->viewWithLayout('master/outlets/form', 'Edit Outlet', 'outlets', [
                'outlet' => $outlet, 'errors' => $result['errors'], 'old' => $input + ['id' => $params['id']], 'entities' => (new EntityRepository())->listActive(),
            ]);
            return;
        }

        Flash::set('success', 'Outlet berhasil diperbarui.');
        $this->redirect('/master/outlets/' . $params['id']);
    }

    /** @return array<string, mixed> */
    private function readInput(): array
    {
        return [
            'entity_id' => $this->input('entity_id', ''),
            'code' => $this->input('code', ''),
            'name' => $this->input('name', ''),
            'area' => $this->input('area', ''),
            'address' => $this->input('address', ''),
            'opening_date' => $this->input('opening_date', ''),
            'partnership_start' => $this->input('partnership_start', ''),
            'partnership_end' => $this->input('partnership_end', ''),
            'status' => $this->input('status', 'active'),
        ];
    }
}
