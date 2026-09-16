<?php

/** @var array<string,mixed> $batch */
/** @var list<array<string,mixed>> $rows */
/** @var \App\Helpers\Paginator $paginator */
/** @var string $filter */

$dupLabels = ['none' => '-', 'duplicate_exact' => 'Duplikat Persis', 'duplicate_suspected' => 'Diduga Duplikat'];
$statusLabels = ['valid' => 'Valid', 'outlet_not_found' => 'Outlet Tidak Ditemukan', 'invalid_date' => 'Tanggal Tidak Valid', 'invalid_amount' => 'Nominal Tidak Valid'];
?>
<h1>Detail Batch Import Pendapatan</h1>

<table>
  <tbody>
    <tr><th>File Asal</th><td><?= e($batch['original_filename']) ?></td></tr>
    <tr><th>Entitas</th><td><?= e($batch['entity_name'] ?? '-') ?></td></tr>
    <tr><th>Sumber</th><td><?= e($batch['source_name'] ?? '-') ?></td></tr>
    <tr><th>Diunggah Oleh</th><td><?= e($batch['uploaded_by_name'] ?? '-') ?></td></tr>
    <tr><th>Status</th><td><span class="badge <?= $batch['status'] === 'completed' ? 'active' : 'warning' ?>"><?= e($batch['status']) ?></span></td></tr>
    <tr><th>Total Baris</th><td><?= (int) $batch['total_rows'] ?></td></tr>
    <tr><th>Valid</th><td><?= (int) $batch['valid_rows'] ?></td></tr>
    <tr><th>Duplikat Persis</th><td><?= (int) $batch['duplicate_rows'] ?></td></tr>
    <tr><th>Diduga Duplikat</th><td><?= (int) $batch['suspected_duplicate_rows'] ?></td></tr>
    <tr><th>Error</th><td><?= (int) $batch['error_rows'] ?></td></tr>
  </tbody>
</table>

<div class="filters" style="margin-top:1rem;">
  <a class="btn secondary" href="?">Semua</a>
  <a class="btn secondary" href="?filter=errors">Bermasalah</a>
  <a class="btn secondary" href="?filter=duplicates">Duplikat</a>
</div>

<?php if ($rows === []): ?>
  <div class="empty-state">Tidak ada baris untuk filter ini.</div>
<?php else: ?>
<table>
  <thead><tr><th>#</th><th>Tanggal</th><th>Outlet</th><th>Kategori</th><th>Deskripsi</th><th>Jumlah</th><th>Referensi</th><th>Status</th><th>Duplikat</th></tr></thead>
  <tbody>
  <?php foreach ($rows as $row): ?>
    <tr>
      <td><?= (int) $row['source_row_number'] + 1 ?></td>
      <td><?= e($row['transaction_date']) ?></td>
      <td><?= e($row['outlet_name'] ?? '-') ?></td>
      <td><?= e($row['revenue_category']) ?></td>
      <td><?= e($row['description']) ?></td>
      <td><?= number_format((float) $row['amount'], 2, ',', '.') ?></td>
      <td><?= e($row['external_reference']) ?></td>
      <td><span class="badge <?= $row['validation_status'] === 'valid' ? 'active' : 'warning' ?>"><?= e($statusLabels[$row['validation_status']] ?? $row['validation_status']) ?></span></td>
      <td><?= e($dupLabels[$row['duplicate_status']] ?? $row['duplicate_status']) ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
<div class="pagination">
  <?php if ($paginator->hasPrevious()): ?><a href="?page=<?= $paginator->page - 1 ?>&filter=<?= e($filter) ?>">&laquo; Sebelumnya</a><?php endif; ?>
  <span>Halaman <?= $paginator->page ?> dari <?= $paginator->lastPage() ?> (<?= $paginator->total ?> data)</span>
  <?php if ($paginator->hasNext()): ?><a href="?page=<?= $paginator->page + 1 ?>&filter=<?= e($filter) ?>">Berikutnya &raquo;</a><?php endif; ?>
</div>
<?php endif; ?>
