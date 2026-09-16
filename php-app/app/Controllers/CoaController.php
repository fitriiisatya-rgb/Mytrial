<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\CoaRepository;
use App\Services\CoaService;

final class CoaController extends Controller
{
    public function index(): void
    {
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : null;
        $accountType = isset($_GET['account_type']) && $_GET['account_type'] !== '' ? (string) $_GET['account_type'] : null;
        $activeFilter = isset($_GET['status']) && $_GET['status'] !== '' ? (string) $_GET['status'] : null;

        $repo = new CoaRepository();
        $total = $repo->count($search, $accountType, $activeFilter);
        $paginator = Paginator::fromRequest($total);
        $accounts = $repo->paginate($paginator, $search, $accountType, $activeFilter);

        $this->viewWithLayout('master/coa/index', 'Chart of Accounts', 'coa', [
            'accounts' => $accounts,
            'paginator' => $paginator,
            'search' => $search ?? '',
            'accountType' => $accountType ?? '',
            'status' => $activeFilter ?? '',
        ]);
    }

    public function create(): void
    {
        $this->viewWithLayout('master/coa/form', 'Tambah Akun COA', 'coa', [
            'account' => null, 'errors' => [], 'old' => [], 'parents' => (new CoaRepository())->listAll(),
        ]);
    }

    public function store(): void
    {
        $input = $this->readInput();
        $result = (new CoaService())->create($input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $this->viewWithLayout('master/coa/form', 'Tambah Akun COA', 'coa', [
                'account' => null, 'errors' => $result['errors'], 'old' => $input, 'parents' => (new CoaRepository())->listAll(),
            ]);
            return;
        }

        Flash::set('success', 'Akun COA berhasil dibuat.');
        $this->redirect('/master/coa');
    }

    public function show(array $params): void
    {
        $repo = new CoaRepository();
        $account = $repo->findById($params['id']);
        if ($account === null) {
            throw new HttpException(404, 'Akun COA tidak ditemukan');
        }
        $all = $repo->listAll();
        $children = array_values(array_filter($all, static fn ($row) => $row['parent_id'] === $account['id']));

        $this->viewWithLayout('master/coa/show', 'Detail Akun COA', 'coa', [
            'account' => $account, 'children' => $children,
        ]);
    }

    public function edit(array $params): void
    {
        $account = (new CoaRepository())->findById($params['id']);
        if ($account === null) {
            throw new HttpException(404, 'Akun COA tidak ditemukan');
        }
        $this->viewWithLayout('master/coa/form', 'Edit Akun COA', 'coa', [
            'account' => $account, 'errors' => [], 'old' => $account, 'parents' => (new CoaRepository())->listAll(),
        ]);
    }

    public function update(array $params): void
    {
        $input = $this->readInput();
        $result = (new CoaService())->update($params['id'], $input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $account = (new CoaRepository())->findById($params['id']);
            $this->viewWithLayout('master/coa/form', 'Edit Akun COA', 'coa', [
                'account' => $account, 'errors' => $result['errors'], 'old' => $input + ['id' => $params['id']], 'parents' => (new CoaRepository())->listAll(),
            ]);
            return;
        }

        Flash::set('success', 'Akun COA berhasil diperbarui.');
        $this->redirect('/master/coa/' . $params['id']);
    }

    /** @return array<string, mixed> */
    private function readInput(): array
    {
        return [
            'code' => $this->input('code', ''),
            'name' => $this->input('name', ''),
            'account_type' => $this->input('account_type', ''),
            'parent_id' => $this->input('parent_id', ''),
            'normal_balance' => $this->input('normal_balance', ''),
            'pnl_category' => $this->input('pnl_category', ''),
            'reporting_order' => $this->input('reporting_order', '0'),
            'is_active' => $this->input('is_active', '') === '1',
        ];
    }
}
