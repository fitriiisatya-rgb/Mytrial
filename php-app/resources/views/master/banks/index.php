<?php

use App\Policies\Policy;

/** @var list<array<string,mixed>> $banks */
/** @var \App\Helpers\Paginator $paginator */
$canWrite = Policy::can($user, 'master.banks.write');
?>
<div class="topbar">
  <h1>Rekening Bank</h1>
  <?php if ($canWrite): ?><a class="btn" href="/master/banks/create">+ Tambah Rekening</a><?php endif; ?>
</div>

<form class="filters" method="get" action="/master/banks">
  <input type="text" name="search" placeholder="Cari bank/no rekening..." value="<?= e($search) ?>">
  <select name="entity_id">
    <option value="">Semua Entitas</option>
    <?php foreach ($entities as $entity): ?>
      <option value="<?= e($entity['id']) ?>" <?= $entityId === $entity['id'] ? 'selected' : '' ?>><?= e($entity['name']) ?></option>
    <?php endforeach; ?>
  </select>
  <select name="status">
    <option value="">Semua Status</option>
    <option value="active" <?= $status === 'active' ? 'selected' : '' ?>>Aktif</option>
    <option value="inactive" <?= $status === 'inactive' ? 'selected' : '' ?>>Non-aktif</option>
  </select>
  <button class="btn secondary" type="submit">Filter</button>
</form>

<?php if ($banks === []): ?>
  <div class="empty-state">Belum ada data rekening bank.</div>
<?php else: ?>
<table>
  <thead><tr><th>Bank</th><th>No Rekening</th><th>Atas Nama</th><th>COA</th><th>Status</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($banks as $bank): ?>
    <tr>
      <td><a href="/master/banks/<?= e($bank['id']) ?>"><?= e($bank['bank_name']) ?></a></td>
      <td><?= e($bank['account_number']) ?></td>
      <td><?= e($bank['account_name']) ?></td>
      <td><?= e($bank['coa_code']) ?> - <?= e($bank['coa_name']) ?></td>
      <td><span class="badge <?= $bank['is_active'] ? 'active' : 'inactive' ?>"><?= $bank['is_active'] ? 'Aktif' : 'Non-aktif' ?></span></td>
      <td><?php if ($canWrite): ?><a href="/master/banks/<?= e($bank['id']) ?>/edit">Edit</a><?php endif; ?></td>
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
