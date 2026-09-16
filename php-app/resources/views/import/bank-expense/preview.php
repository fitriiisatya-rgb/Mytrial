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

$typeLabels = [
    'expense_candidate' => 'Kandidat Pengeluaran',
    'debit_only_ignored' => 'Debit Saja (diabaikan)',
    'not_candidate' => 'Bukan Kandidat',
    'invalid' => 'Tidak Valid',
];
$dupLabels = ['none' => '-', 'duplicate_exact' => 'Duplikat Persis', 'duplicate_suspected' => 'Diduga Duplikat'];
?>
<h1>Preview Import Pengeluaran Bank</h1>
<p style="color:#6b7280;font-size:.9rem;">File: <strong><?= e($originalFilename) ?></strong> - baris header terdeteksi
  pada baris <?= $headerRowNumber + 1 ?><?= $headerConfidenceLow ? ' (keyakinan rendah - periksa kembali)' : '' ?>.
  Belum ada data yang disimpan ke database pada tahap ini.</p>

<?php if ($duplicateFileOfBatchId !== null): ?>
  <div class="flash error">
    File ini identik (checksum sama) dengan file yang sudah pernah berhasil diimpor sebelumnya
    (<a href="/import/bank-expense/batches/<?= e($duplicateFileOfBatchId) ?>">lihat batch tersebut</a>).
    Melanjutkan proses ini akan menandai seluruh baris sebagai duplikat dan tidak menambah data baru.
  </div>
<?php endif; ?>

<h2>Statistik</h2>
<table>
  <tbody>
    <tr><th>Total Baris</th><td><?= $stats['total_rows'] ?></td></tr>
    <tr><th>Kandidat Pengeluaran</th><td><?= $stats['candidate_rows'] ?></td></tr>
    <tr><th>Valid (bank cocok, tanggal/nominal sah)</th><td><?= $stats['valid_rows'] ?></td></tr>
    <tr><th>Diabaikan (debit saja)</th><td><?= $stats['ignored_rows'] ?></td></tr>
    <tr><th>Duplikat Persis (file sama, dilewati)</th><td><?= $stats['duplicate_rows'] ?></td></tr>
    <tr><th>Diduga Duplikat (tetap disimpan, perlu ditinjau)</th><td><?= $stats['suspected_duplicate_rows'] ?></td></tr>
    <tr><th>Bank Cocok</th><td><?= $stats['bank_matched_rows'] ?></td></tr>
    <tr><th>Bank Tidak Ditemukan</th><td><?= $stats['bank_not_found_rows'] ?></td></tr>
    <tr><th>Baris Error</th><td><?= $stats['error_rows'] ?></td></tr>
  </tbody>
</table>

<h2>Contoh Data (maks. 15 baris pertama)</h2>
<table>
  <thead><tr><th>Tanggal</th><th>Bank</th><th>Klasifikasi</th><th>Deskripsi</th><th>Debit</th><th>Kredit</th><th>Tipe</th><th>Duplikat</th></tr></thead>
  <tbody>
  <?php foreach ($samples as $row): ?>
    <tr>
      <td><?= e($row['transaction_date'] ?? $row['raw_date']) ?></td>
      <td><?= e($row['bank_label']) ?><?= $row['bank_account_id'] === null ? ' <span class="badge warning">tidak cocok</span>' : '' ?></td>
      <td><?= e($row['classification']) ?></td>
      <td><?= e($row['description']) ?></td>
      <td><?= number_format($row['debit_sen'] / 100, 2, ',', '.') ?></td>
      <td><?= number_format($row['credit_sen'] / 100, 2, ',', '.') ?></td>
      <td><span class="badge <?= $row['transaction_type'] === 'invalid' ? 'invalid' : 'none' ?>"><?= e($typeLabels[$row['transaction_type']] ?? $row['transaction_type']) ?></span></td>
      <td><?= e($dupLabels[$row['duplicate_status']] ?? $row['duplicate_status']) ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>

<div style="margin-top:1rem; display:flex; gap:.5rem;">
  <form method="post" action="/import/bank-expense/confirm">
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
  <form method="post" action="/import/bank-expense/cancel">
    <?= Csrf::field() ?>
    <input type="hidden" name="token" value="<?= e($token) ?>">
    <input type="hidden" name="extension" value="<?= e($extension) ?>">
    <button class="btn secondary" type="submit">Batal</button>
  </form>
</div>
