<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Flash;
use App\Helpers\HttpException;
use App\Helpers\Paginator;
use App\Repositories\EntityRepository;
use App\Repositories\ImportSourceRepository;
use App\Services\ImportSourceService;

final class ImportSourceController extends Controller
{
    public function index(): void
    {
        $sourceType = isset($_GET['source_type']) && $_GET['source_type'] !== '' ? (string) $_GET['source_type'] : null;
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : null;

        $repo = new ImportSourceRepository();
        $total = $repo->count($sourceType, $search);
        $paginator = Paginator::fromRequest($total);
        $sources = $repo->paginate($paginator, $sourceType, $search);

        $this->viewWithLayout('import/sources/index', 'Sumber Data Import', 'import', [
            'sources' => $sources,
            'paginator' => $paginator,
            'sourceType' => $sourceType ?? '',
            'search' => $search ?? '',
        ]);
    }

    public function create(): void
    {
        $this->viewWithLayout('import/sources/form', 'Tambah Sumber Data', 'import', [
            'source' => null, 'errors' => [], 'old' => [],
            'entities' => (new EntityRepository())->listActive(),
        ]);
    }

    public function store(): void
    {
        $input = $this->readInput();
        $result = (new ImportSourceService())->create($input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $this->viewWithLayout('import/sources/form', 'Tambah Sumber Data', 'import', [
                'source' => null, 'errors' => $result['errors'], 'old' => $input,
                'entities' => (new EntityRepository())->listActive(),
            ]);
            return;
        }

        Flash::set('success', 'Sumber data berhasil dibuat.');
        $this->redirect('/import/sources');
    }

    public function edit(array $params): void
    {
        $source = (new ImportSourceRepository())->findById($params['id']);
        if ($source === null) {
            throw new HttpException(404, 'Sumber data tidak ditemukan');
        }
        $this->viewWithLayout('import/sources/form', 'Edit Sumber Data', 'import', [
            'source' => $source, 'errors' => [], 'old' => $source,
            'entities' => (new EntityRepository())->listActive(),
        ]);
    }

    public function update(array $params): void
    {
        $input = $this->readInput();
        $result = (new ImportSourceService())->update($params['id'], $input, $this->currentUser()['id']);

        if (!$result['ok']) {
            $source = (new ImportSourceRepository())->findById($params['id']);
            $this->viewWithLayout('import/sources/form', 'Edit Sumber Data', 'import', [
                'source' => $source, 'errors' => $result['errors'], 'old' => $input + ['id' => $params['id']],
                'entities' => (new EntityRepository())->listActive(),
            ]);
            return;
        }

        Flash::set('success', 'Sumber data berhasil diperbarui.');
        $this->redirect('/import/sources');
    }

    /** @return array<string, mixed> */
    private function readInput(): array
    {
        return [
            'source_type' => $this->input('source_type', ''),
            'name' => $this->input('name', ''),
            'entity_id' => $this->input('entity_id', ''),
            'column_mapping' => $this->input('column_mapping', ''),
            'is_active' => $this->input('is_active', '') === '1',
        ];
    }
}
