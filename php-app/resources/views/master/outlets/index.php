<?php

use App\Policies\Policy;

/** @var list<array<string,mixed>> $outlets */
/** @var \App\Helpers\Paginator $paginator */
$canWrite = Policy::can($user, 'master.outlets.write');
$indicatorLabel = ['valid' => '100%', 'warning' => 'Kurang', 'invalid' => 'Lebih 100%'];
?>
<div class="topbar">
  <h1>Outlet</h1>
  <?php if ($canWrite): ?><a class="btn" href="/master/outlets/create">+ Tambah Outlet</a><?php endif; ?>
</div>

<form class="filters" method="get" action="/master/outlets">
  <input type="text" name="search" placeholder="Cari kode/nama..." value="<?= e($search) ?>">
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

<?php if ($outlets === []): ?>
  <div class="empty-state">Belum ada data outlet.</div>
<?php else: ?>
<table>
  <thead><tr><th>Kode</th><th>Nama</th><th>Entitas</th><th>Status</th><th>Kepemilikan</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($outlets as $outlet): ?>
    <tr>
      <td><?= e($outlet['code']) ?></td>
      <td><a href="/master/outlets/<?= e($outlet['id']) ?>"><?= e($outlet['name']) ?></a></td>
      <td><?= e($outlet['entity_name']) ?></td>
      <td><span class="badge <?= e($outlet['status']) ?>"><?= $outlet['status'] === 'active' ? 'Aktif' : 'Non-aktif' ?></span></td>
      <td><span class="badge <?= $outlet['ownership_indicator'] === 'valid' ? 'active' : $outlet['ownership_indicator'] ?>"><?= number_format((float) $outlet['ownership_total'], 2) ?>%</span></td>
      <td><?php if ($canWrite): ?><a href="/master/outlets/<?= e($outlet['id']) ?>/edit">Edit</a><?php endif; ?></td>
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
