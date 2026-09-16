<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Paginator;
use App\Repositories\EntityRepository;
use App\Repositories\ImportBatchRepository;

/**
 * spec's "Riwayat Import" tab - every batch ever run, both source types
 * together, each row linking to its own type-specific detail page
 * (BankExpenseImportController::showBatch() or
 * RevenueImportController::showBatch()) since the two normalize into
 * different tables with different columns.
 */
final class ImportHistoryController extends Controller
{
    public function index(): void
    {
        $sourceType = isset($_GET['source_type']) && $_GET['source_type'] !== '' ? (string) $_GET['source_type'] : null;
        $status = isset($_GET['status']) && $_GET['status'] !== '' ? (string) $_GET['status'] : null;
        $entityId = isset($_GET['entity_id']) && $_GET['entity_id'] !== '' ? (string) $_GET['entity_id'] : null;

        $repo = new ImportBatchRepository();
        $total = $repo->countBatches($sourceType, $status, $entityId);
        $paginator = Paginator::fromRequest($total);
        $batches = $repo->paginateBatches($paginator, $sourceType, $status, $entityId);

        $this->viewWithLayout('import/history/index', 'Riwayat Import', 'import', [
            'batches' => $batches,
            'paginator' => $paginator,
            'sourceType' => $sourceType ?? '',
            'status' => $status ?? '',
            'entityId' => $entityId ?? '',
            'entities' => (new EntityRepository())->listActive(),
        ]);
    }
}
