<?php

use App\Helpers\Csrf;
use App\Policies\Policy;

/** @var list<array<string,mixed>> $entities */
/** @var \App\Helpers\Paginator $paginator */
/** @var string $search */
/** @var string $status */
$canWrite = Policy::can($user, 'master.entities.write');
?>
<div class="topbar">
  <h1>Entitas</h1>
  <?php if ($canWrite): ?><a class="btn" href="/master/entities/create">+ Tambah Entitas</a><?php endif; ?>
</div>

<form class="filters" method="get" action="/master/entities">
  <input type="text" name="search" placeholder="Cari kode/nama..." value="<?= e($search) ?>">
  <select name="status">
    <option value="">Semua Status</option>
    <option value="active" <?= $status === 'active' ? 'selected' : '' ?>>Aktif</option>
    <option value="inactive" <?= $status === 'inactive' ? 'selected' : '' ?>>Non-aktif</option>
  </select>
  <button class="btn secondary" type="submit">Filter</button>
</form>

<?php if ($entities === []): ?>
  <div class="empty-state">Belum ada data entitas.</div>
<?php else: ?>
<table>
  <thead><tr><th>Kode</th><th>Nama</th><th>Status</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($entities as $entity): ?>
    <tr>
      <td><?= e($entity['code']) ?></td>
      <td><a href="/master/entities/<?= e($entity['id']) ?>"><?= e($entity['name']) ?></a></td>
      <td><span class="badge <?= e($entity['status']) ?>"><?= $entity['status'] === 'active' ? 'Aktif' : 'Non-aktif' ?></span></td>
      <td><?php if ($canWrite): ?><a href="/master/entities/<?= e($entity['id']) ?>/edit">Edit</a><?php endif; ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
<div class="pagination">
  <?php if ($paginator->hasPrevious()): ?><a href="?page=<?= $paginator->page - 1 ?>&search=<?= e($search) ?>&status=<?= e($status) ?>">&laquo; Sebelumnya</a><?php endif; ?>
  <span>Halaman <?= $paginator->page ?> dari <?= $paginator->lastPage() ?> (<?= $paginator->total ?> data)</span>
  <?php if ($paginator->hasNext()): ?><a href="?page=<?= $paginator->page + 1 ?>&search=<?= e($search) ?>&status=<?= e($status) ?>">Berikutnya &raquo;</a><?php endif; ?>
</div>
<?php endif; ?>
