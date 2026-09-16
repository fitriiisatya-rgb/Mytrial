<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\EntityRepository;
use App\Services\EntityService;

final class EntityController extends Controller
{
    public function index(): void
    {
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : null;
        $status = isset($_GET['status']) && $_GET['status'] !== '' ? (string) $_GET['status'] : null;

        $repo = new EntityRepository();
        $total = $repo->count($search, $status);
        $paginator = Paginator::fromRequest($total);
        $entities = $repo->paginate($paginator, $search, $status);

        $this->viewWithLayout('master/entities/index', 'Entitas', 'entities', [
            'entities' => $entities,
            'paginator' => $paginator,
            'search' => $search ?? '',
            'status' => $status ?? '',
        ]);
    }

    public function create(): void
    {
        $this->viewWithLayout('master/entities/form', 'Tambah Entitas', 'entities', [
            'entity' => null, 'errors' => [], 'old' => [],
        ]);
    }

    public function store(): void
    {
        $input = ['code' => $this->input('code', ''), 'name' => $this->input('name', ''), 'status' => $this->input('status', 'active')];
        $result = (new EntityService())->create($input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $this->viewWithLayout('master/entities/form', 'Tambah Entitas', 'entities', [
                'entity' => null, 'errors' => $result['errors'], 'old' => $input,
            ]);
            return;
        }

        Flash::set('success', 'Entitas berhasil dibuat.');
        $this->redirect('/master/entities');
    }

    public function show(array $params): void
    {
        $repo = new EntityRepository();
        $entity = $repo->findById($params['id']);
        if ($entity === null) {
            throw new HttpException(404, 'Entitas tidak ditemukan');
        }
        $this->viewWithLayout('master/entities/show', 'Detail Entitas', 'entities', [
            'entity' => $entity,
            'outletCount' => $repo->outletCount($entity['id']),
            'bankCount' => $repo->bankCount($entity['id']),
        ]);
    }

    public function edit(array $params): void
    {
        $entity = (new EntityRepository())->findById($params['id']);
        if ($entity === null) {
            throw new HttpException(404, 'Entitas tidak ditemukan');
        }
        $this->viewWithLayout('master/entities/form', 'Edit Entitas', 'entities', [
            'entity' => $entity, 'errors' => [], 'old' => $entity,
        ]);
    }

    public function update(array $params): void
    {
        $input = ['code' => $this->input('code', ''), 'name' => $this->input('name', ''), 'status' => $this->input('status', 'active')];
        $result = (new EntityService())->update($params['id'], $input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $entity = (new EntityRepository())->findById($params['id']);
            $this->viewWithLayout('master/entities/form', 'Edit Entitas', 'entities', [
                'entity' => $entity, 'errors' => $result['errors'], 'old' => $input + ['id' => $params['id']],
            ]);
            return;
        }

        Flash::set('success', 'Entitas berhasil diperbarui.');
        $this->redirect('/master/entities/' . $params['id']);
    }
}
