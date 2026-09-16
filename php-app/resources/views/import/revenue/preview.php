<?php

use App\Helpers\Csrf;

/** @var string $token */
/** @var string $extension */
/** @var string $originalFilename */
/** @var string|null $entityId */
/** @var string|null $sourceName */
/** @var int $headerRowNumber */
/** @var bool $headerConfidenceLow */
/** @var string|null $duplicateFileOfBatchId */
/** @var array<string,int> $stats */
/** @var array<int, array<string,mixed>> $samples */

$statusLabels = ['valid' => 'Valid', 'outlet_not_found' => 'Outlet Tidak Ditemukan', 'invalid_date' => 'Tanggal Tidak Valid', 'invalid_amount' => 'Nominal Tidak Valid'];
$dupLabels = ['none' => '-', 'duplicate_exact' => 'Duplikat Persis', 'duplicate_suspected' => 'Diduga Duplikat'];
?>
<h1>Preview Import Pendapatan</h1>
<p style="color:#6b7280;font-size:.9rem;">File: <strong><?= e($originalFilename) ?></strong> - baris header terdeteksi
  pada baris <?= $headerRowNumber + 1 ?><?= $headerConfidenceLow ? ' (keyakinan rendah - periksa kembali)' : '' ?>.
  Belum ada data yang disimpan ke database pada tahap ini. Tidak ada jurnal akuntansi yang dibuat oleh proses ini.</p>

<?php if ($duplicateFileOfBatchId !== null): ?>
  <div class="flash error">
    File ini identik (checksum sama) dengan file yang sudah pernah berhasil diimpor sebelumnya
    (<a href="/import/revenue/batches/<?= e($duplicateFileOfBatchId) ?>">lihat batch tersebut</a>).
    Melanjutkan proses ini akan menandai seluruh baris sebagai duplikat dan tidak menambah data baru.
  </div>
<?php endif; ?>

<h2>Statistik</h2>
<table>
  <tbody>
    <tr><th>Total Baris</th><td><?= $stats['total_rows'] ?></td></tr>
    <tr><th>Valid</th><td><?= $stats['valid_rows'] ?></td></tr>
    <tr><th>Outlet Cocok</th><td><?= $stats['outlet_matched_rows'] ?></td></tr>
    <tr><th>Outlet Tidak Ditemukan</th><td><?= $stats['outlet_not_found_rows'] ?></td></tr>
    <tr><th>Duplikat Persis (file sama, dilewati)</th><td><?= $stats['duplicate_rows'] ?></td></tr>
    <tr><th>Diduga Duplikat (tetap disimpan, perlu ditinjau)</th><td><?= $stats['suspected_duplicate_rows'] ?></td></tr>
    <tr><th>Baris Error</th><td><?= $stats['error_rows'] ?></td></tr>
  </tbody>
</table>

<h2>Contoh Data (maks. 15 baris pertama)</h2>
<table>
  <thead><tr><th>Tanggal</th><th>Outlet</th><th>Kategori</th><th>Deskripsi</th><th>Jumlah</th><th>Referensi</th><th>Status</th><th>Duplikat</th></tr></thead>
  <tbody>
  <?php foreach ($samples as $row): ?>
    <tr>
      <td><?= e($row['transaction_date'] ?? $row['raw_date']) ?></td>
      <td><?= e($row['outlet_label']) ?><?= $row['outlet_id'] === null ? ' <span class="badge warning">tidak cocok</span>' : '' ?></td>
      <td><?= e($row['revenue_category']) ?></td>
      <td><?= e($row['description']) ?></td>
      <td><?= number_format($row['amount_sen'] / 100, 2, ',', '.') ?></td>
      <td><?= e($row['external_reference']) ?></td>
      <td><span class="badge <?= $row['validation_status'] === 'valid' ? 'active' : 'warning' ?>"><?= e($statusLabels[$row['validation_status']] ?? $row['validation_status']) ?></span></td>
      <td><?= e($dupLabels[$row['duplicate_status']] ?? $row['duplicate_status']) ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>

<div style="margin-top:1rem; display:flex; gap:.5rem;">
  <form method="post" action="/import/revenue/confirm">
    <?= Csrf::field() ?>
    <input type="hidden" name="token" value="<?= e($token) ?>">
    <input type="hidden" name="extension" value="<?= e($extension) ?>">
    <input type="hidden" name="original_filename" value="<?= e($originalFilename) ?>">
    <input type="hidden" name="header_row_number" value="<?= (int) $headerRowNumber ?>">
    <input type="hidden" name="entity_id" value="<?= e($entityId) ?>">
    <input type="hidden" name="source_name" value="<?= e($sourceName) ?>">
    <input type="hidden" name="import_source_id" value="<?= e($importSourceId) ?>">
    <button class="btn" type="submit">Konfirmasi &amp; Simpan</button>
  </form>
  <form method="post" action="/import/revenue/cancel">
    <?= Csrf::field() ?>
    <input type="hidden" name="token" value="<?= e($token) ?>">
    <input type="hidden" name="extension" value="<?= e($extension) ?>">
    <button class="btn secondary" type="submit">Batal</button>
  </form>
</div>
