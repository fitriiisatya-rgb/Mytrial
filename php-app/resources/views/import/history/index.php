<?php

/** @var list<array<string,mixed>> $batches */
/** @var \App\Helpers\Paginator $paginator */
/** @var string $sourceType */
/** @var string $status */
/** @var string $entityId */
/** @var list<array<string,mixed>> $entities */

$typeLabels = ['bank_expense' => 'Pengeluaran Bank', 'revenue' => 'Penerimaan'];
$detailBase = static fn (string $sourceType): string => $sourceType === 'revenue' ? '/import/revenue/batches/' : '/import/bank-expense/batches/';
?>
<div class="filters" style="margin-bottom:1.5rem;">
  <a class="btn secondary" href="/import/bank-expense">Pengeluaran Bank</a>
  <a class="btn secondary" href="/import/revenue">Penerimaan</a>
  <a class="btn" href="/import/history">Riwayat Import</a>
  <a class="btn secondary" href="/import/sources">Sumber Data</a>
</div>

<h1>Riwayat Import</h1>

<form class="filters" method="get" action="/import/history">
  <select name="source_type">
    <option value="">Semua Tipe</option>
    <option value="bank_expense" <?= $sourceType === 'bank_expense' ? 'selected' : '' ?>>Pengeluaran Bank</option>
    <option value="revenue" <?= $sourceType === 'revenue' ? 'selected' : '' ?>>Penerimaan</option>
  </select>
  <select name="status">
    <option value="">Semua Status</option>
    <?php foreach (['pending', 'previewed', 'processing', 'completed', 'failed'] as $s): ?>
      <option value="<?= e($s) ?>" <?= $status === $s ? 'selected' : '' ?>><?= e($s) ?></option>
    <?php endforeach; ?>
  </select>
  <select name="entity_id">
    <option value="">Semua Entitas</option>
    <?php foreach ($entities as $entity): ?>
      <option value="<?= e($entity['id']) ?>" <?= $entityId === $entity['id'] ? 'selected' : '' ?>><?= e($entity['name']) ?></option>
    <?php endforeach; ?>
  </select>
  <button class="btn secondary" type="submit">Filter</button>
</form>

<?php if ($batches === []): ?>
  <div class="empty-state">Belum ada riwayat import.</div>
<?php else: ?>
<table>
  <thead><tr><th>Tanggal</th><th>Tipe</th><th>File</th><th>Entitas</th><th>Diunggah Oleh</th><th>Status</th><th>Total Baris</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($batches as $batch): ?>
    <tr>
      <td><?= e($batch['started_at']) ?></td>
      <td><?= e($typeLabels[$batch['source_type']] ?? $batch['source_type']) ?></td>
      <td><?= e($batch['original_filename']) ?></td>
      <td><?= e($batch['entity_name'] ?? '-') ?></td>
      <td><?= e($batch['uploaded_by_name'] ?? '-') ?></td>
      <td><span class="badge <?= $batch['status'] === 'completed' ? 'active' : ($batch['status'] === 'failed' ? 'invalid' : 'warning') ?>"><?= e($batch['status']) ?></span></td>
      <td><?= (int) $batch['total_rows'] ?></td>
      <td><a href="<?= e($detailBase($batch['source_type'])) . e($batch['id']) ?>">Lihat</a></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
<div class="pagination">
  <?php if ($paginator->hasPrevious()): ?><a href="?page=<?= $paginator->page - 1 ?>">&laquo; Sebelumnya</a><?php endif; ?>
  <span>Halaman <?= $paginator->page ?> dari <?= $paginator->lastPage() ?> (<?= $paginator->total ?> data)</span>
  <?php if ($paginator->hasNext()): ?><a href="?page=<?= $paginator->page + 1 ?>">Berikutnya &raquo;</a><?php endif; ?>
</div>
<?php endif; ?>
