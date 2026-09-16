<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\InvestorRepository;
use App\Repositories\OwnershipRepository;
use App\Repositories\ProfileRepository;
use App\Services\InvestorService;

final class InvestorController extends Controller
{
    public function index(): void
    {
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : null;
        $status = isset($_GET['status']) && $_GET['status'] !== '' ? (string) $_GET['status'] : null;

        $repo = new InvestorRepository();
        $total = $repo->count($search, $status);
        $paginator = Paginator::fromRequest($total);
        $investors = $repo->paginate($paginator, $search, $status);

        $ownershipRepo = new OwnershipRepository();
        foreach ($investors as &$investor) {
            $investor['active_ownership_count'] = $ownershipRepo->currentActiveOwnershipCountForInvestor($investor['id']);
        }
        unset($investor);

        $this->viewWithLayout('master/investors/index', 'Investor', 'investors', [
            'investors' => $investors,
            'paginator' => $paginator,
            'search' => $search ?? '',
            'status' => $status ?? '',
        ]);
    }

    public function create(): void
    {
        $this->viewWithLayout('master/investors/form', 'Tambah Investor', 'investors', [
            'investor' => null, 'errors' => [], 'old' => [],
            'profiles' => (new ProfileRepository())->listActiveByRole('investor'),
        ]);
    }

    public function store(): void
    {
        $input = $this->readInput();
        $result = (new InvestorService())->create($input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $this->viewWithLayout('master/investors/form', 'Tambah Investor', 'investors', [
                'investor' => null, 'errors' => $result['errors'], 'old' => $input,
                'profiles' => (new ProfileRepository())->listActiveByRole('investor'),
            ]);
            return;
        }

        Flash::set('success', 'Investor berhasil dibuat.');
        $this->redirect('/master/investors');
    }

    public function show(array $params): void
    {
        $investor = (new InvestorRepository())->findById($params['id']);
        if ($investor === null) {
            throw new HttpException(404, 'Investor tidak ditemukan');
        }

        $ownershipRepo = new OwnershipRepository();
        $this->viewWithLayout('master/investors/show', 'Detail Investor', 'investors', [
            'investor' => $investor,
            'current' => $ownershipRepo->currentForInvestor($investor['id']),
            'history' => $ownershipRepo->historyForInvestor($investor['id']),
        ]);
    }

    public function edit(array $params): void
    {
        $investor = (new InvestorRepository())->findById($params['id']);
        if ($investor === null) {
            throw new HttpException(404, 'Investor tidak ditemukan');
        }
        $this->viewWithLayout('master/investors/form', 'Edit Investor', 'investors', [
            'investor' => $investor, 'errors' => [], 'old' => $investor,
            'profiles' => (new ProfileRepository())->listActiveByRole('investor'),
        ]);
    }

    public function update(array $params): void
    {
        $input = $this->readInput();
        $result = (new InvestorService())->update($params['id'], $input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $investor = (new InvestorRepository())->findById($params['id']);
            $this->viewWithLayout('master/investors/form', 'Edit Investor', 'investors', [
                'investor' => $investor, 'errors' => $result['errors'], 'old' => $input + ['id' => $params['id']],
                'profiles' => (new ProfileRepository())->listActiveByRole('investor'),
            ]);
            return;
        }

        Flash::set('success', 'Investor berhasil diperbarui.');
        $this->redirect('/master/investors/' . $params['id']);
    }

    /** @return array<string, mixed> */
    private function readInput(): array
    {
        return [
            'code' => $this->input('code', ''),
            'full_name' => $this->input('full_name', ''),
            'email' => $this->input('email', ''),
            'phone' => $this->input('phone', ''),
            'profile_id' => $this->input('profile_id', ''),
            'status' => $this->input('status', 'active'),
        ];
    }
}
