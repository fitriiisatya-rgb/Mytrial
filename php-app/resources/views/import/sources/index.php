<?php

use App\Policies\Policy;

/** @var list<array<string,mixed>> $sources */
/** @var \App\Helpers\Paginator $paginator */
/** @var string $sourceType */
/** @var string $search */
$canWrite = Policy::can($user, 'import.sources.write');
$typeLabels = ['bank_expense' => 'Pengeluaran Bank', 'revenue' => 'Penerimaan'];
?>
<div class="filters" style="margin-bottom:1.5rem;">
  <a class="btn secondary" href="/import/bank-expense">Pengeluaran Bank</a>
  <a class="btn secondary" href="/import/revenue">Penerimaan</a>
  <a class="btn secondary" href="/import/history">Riwayat Import</a>
  <a class="btn" href="/import/sources">Sumber Data</a>
</div>

<div class="topbar">
  <h1>Sumber Data Import</h1>
  <?php if ($canWrite): ?><a class="btn" href="/import/sources/create">+ Tambah Sumber Data</a><?php endif; ?>
</div>
<p style="color:#6b7280;font-size:.9rem;">Sumber data opsional yang menyimpan pemetaan kolom (column mapping)
  untuk dipakai ulang pada upload berikutnya - satu sumber per file/format berulang (misal "Buku Bank BCA
  Operasional").</p>

<form class="filters" method="get" action="/import/sources">
  <input type="text" name="search" placeholder="Cari nama sumber..." value="<?= e($search) ?>">
  <select name="source_type">
    <option value="">Semua Tipe</option>
    <option value="bank_expense" <?= $sourceType === 'bank_expense' ? 'selected' : '' ?>>Pengeluaran Bank</option>
    <option value="revenue" <?= $sourceType === 'revenue' ? 'selected' : '' ?>>Penerimaan</option>
  </select>
  <button class="btn secondary" type="submit">Filter</button>
</form>

<?php if ($sources === []): ?>
  <div class="empty-state">Belum ada sumber data tersimpan.</div>
<?php else: ?>
<table>
  <thead><tr><th>Nama</th><th>Tipe</th><th>Entitas</th><th>Status</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($sources as $source): ?>
    <tr>
      <td><?= e($source['name']) ?></td>
      <td><?= e($typeLabels[$source['source_type']] ?? $source['source_type']) ?></td>
      <td><?= e($source['entity_name'] ?? '-') ?></td>
      <td><span class="badge <?= $source['is_active'] ? 'active' : 'inactive' ?>"><?= $source['is_active'] ? 'Aktif' : 'Non-aktif' ?></span></td>
      <td><?php if ($canWrite): ?><a href="/import/sources/<?= e($source['id']) ?>/edit">Edit</a><?php endif; ?></td>
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
