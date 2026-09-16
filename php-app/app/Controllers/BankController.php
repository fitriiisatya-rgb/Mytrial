<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\BankRepository;
use App\Repositories\CoaRepository;
use App\Repositories\EntityRepository;
use App\Services\BankService;

final class BankController extends Controller
{
    public function index(): void
    {
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : null;
        $status = isset($_GET['status']) && $_GET['status'] !== '' ? (string) $_GET['status'] : null;
        $entityId = isset($_GET['entity_id']) && $_GET['entity_id'] !== '' ? (string) $_GET['entity_id'] : null;

        $repo = new BankRepository();
        $total = $repo->count($search, $status, $entityId);
        $paginator = Paginator::fromRequest($total);
        $banks = $repo->paginate($paginator, $search, $status, $entityId);

        $this->viewWithLayout('master/banks/index', 'Rekening Bank', 'banks', [
            'banks' => $banks,
            'paginator' => $paginator,
            'search' => $search ?? '',
            'status' => $status ?? '',
            'entityId' => $entityId ?? '',
            'entities' => (new EntityRepository())->listActive(),
        ]);
    }

    public function create(): void
    {
        $this->viewWithLayout('master/banks/form', 'Tambah Rekening Bank', 'banks', [
            'bank' => null, 'errors' => [], 'old' => [],
            'entities' => (new EntityRepository())->listActive(),
            'coaOptions' => (new CoaRepository())->listAvailableForBank(),
        ]);
    }

    public function store(): void
    {
        $input = $this->readInput();
        $result = (new BankService())->create($input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $this->viewWithLayout('master/banks/form', 'Tambah Rekening Bank', 'banks', [
                'bank' => null, 'errors' => $result['errors'], 'old' => $input,
                'entities' => (new EntityRepository())->listActive(),
                'coaOptions' => (new CoaRepository())->listAvailableForBank(),
            ]);
            return;
        }

        Flash::set('success', 'Rekening bank berhasil dibuat.');
        $this->redirect('/master/banks');
    }

    public function show(array $params): void
    {
        $bank = (new BankRepository())->findById($params['id']);
        if ($bank === null) {
            throw new HttpException(404, 'Rekening bank tidak ditemukan');
        }
        $this->viewWithLayout('master/banks/show', 'Detail Rekening Bank', 'banks', ['bank' => $bank]);
    }

    public function edit(array $params): void
    {
        $bank = (new BankRepository())->findById($params['id']);
        if ($bank === null) {
            throw new HttpException(404, 'Rekening bank tidak ditemukan');
        }
        $this->viewWithLayout('master/banks/form', 'Edit Rekening Bank', 'banks', [
            'bank' => $bank, 'errors' => [], 'old' => $bank,
            'entities' => (new EntityRepository())->listActive(),
            'coaOptions' => (new CoaRepository())->listAvailableForBank($bank['coa_id']),
        ]);
    }

    public function update(array $params): void
    {
        $input = $this->readInput();
        $result = (new BankService())->update($params['id'], $input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $bank = (new BankRepository())->findById($params['id']);
            $this->viewWithLayout('master/banks/form', 'Edit Rekening Bank', 'banks', [
                'bank' => $bank, 'errors' => $result['errors'], 'old' => $input + ['id' => $params['id']],
                'entities' => (new EntityRepository())->listActive(),
                'coaOptions' => (new CoaRepository())->listAvailableForBank($bank['coa_id'] ?? null),
            ]);
            return;
        }

        Flash::set('success', 'Rekening bank berhasil diperbarui.');
        $this->redirect('/master/banks/' . $params['id']);
    }

    /** @return array<string, mixed> */
    private function readInput(): array
    {
        return [
            'entity_id' => $this->input('entity_id', ''),
            'bank_name' => $this->input('bank_name', ''),
            'account_number' => $this->input('account_number', ''),
            'account_name' => $this->input('account_name', ''),
            'coa_id' => $this->input('coa_id', ''),
            'is_active' => $this->input('is_active', '') === '1',
        ];
    }
}
