<?php

/** @var array<string,mixed> $batch */
/** @var list<array<string,mixed>> $rows */
/** @var \App\Helpers\Paginator $paginator */
/** @var string $filter */

$dupLabels = ['none' => '-', 'duplicate_exact' => 'Duplikat Persis', 'duplicate_suspected' => 'Diduga Duplikat'];
$statusLabels = [
    'valid' => 'Valid', 'bank_not_found' => 'Bank Tidak Ditemukan', 'invalid_date' => 'Tanggal Tidak Valid',
    'invalid_amount' => 'Nominal Tidak Valid', 'both_debit_credit' => 'Debit & Kredit Terisi', 'negative_amount' => 'Nominal Negatif',
];
?>
<h1>Detail Batch Import Pengeluaran Bank</h1>

<table>
  <tbody>
    <tr><th>File Asal</th><td><?= e($batch['original_filename']) ?></td></tr>
    <tr><th>Entitas</th><td><?= e($batch['entity_name'] ?? '-') ?></td></tr>
    <tr><th>Sumber</th><td><?= e($batch['source_name'] ?? '-') ?></td></tr>
    <tr><th>Diunggah Oleh</th><td><?= e($batch['uploaded_by_name'] ?? '-') ?></td></tr>
    <tr><th>Status</th><td><span class="badge <?= $batch['status'] === 'completed' ? 'active' : 'warning' ?>"><?= e($batch['status']) ?></span></td></tr>
    <tr><th>Total Baris</th><td><?= (int) $batch['total_rows'] ?></td></tr>
    <tr><th>Kandidat Pengeluaran</th><td><?= (int) $batch['candidate_rows'] ?></td></tr>
    <tr><th>Valid</th><td><?= (int) $batch['valid_rows'] ?></td></tr>
    <tr><th>Diabaikan</th><td><?= (int) $batch['ignored_rows'] ?></td></tr>
    <tr><th>Duplikat Persis</th><td><?= (int) $batch['duplicate_rows'] ?></td></tr>
    <tr><th>Diduga Duplikat</th><td><?= (int) $batch['suspected_duplicate_rows'] ?></td></tr>
    <tr><th>Error</th><td><?= (int) $batch['error_rows'] ?></td></tr>
  </tbody>
</table>

<div class="filters" style="margin-top:1rem;">
  <a class="btn secondary" href="?">Semua</a>
  <a class="btn secondary" href="?filter=candidates">Kandidat Pengeluaran</a>
  <a class="btn secondary" href="?filter=errors">Bermasalah</a>
  <a class="btn secondary" href="?filter=duplicates">Duplikat</a>
</div>

<?php if ($rows === []): ?>
  <div class="empty-state">Tidak ada baris untuk filter ini.</div>
<?php else: ?>
<table>
  <thead><tr><th>#</th><th>Tanggal</th><th>Bank</th><th>Klasifikasi</th><th>Deskripsi</th><th>Debit</th><th>Kredit</th><th>Status</th><th>Duplikat</th></tr></thead>
  <tbody>
  <?php foreach ($rows as $row): ?>
    <tr>
      <td><?= (int) $row['source_row_number'] + 1 ?></td>
      <td><?= e($row['transaction_date']) ?></td>
      <td><?= e($row['bank_name'] ?? '-') ?></td>
      <td><?= e($row['classification']) ?></td>
      <td><?= e($row['description']) ?></td>
      <td><?= number_format((float) $row['debit_amount'], 2, ',', '.') ?></td>
      <td><?= number_format((float) $row['credit_amount'], 2, ',', '.') ?></td>
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
