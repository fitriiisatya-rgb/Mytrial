<?php

use App\Policies\Policy;

/** @var list<array<string,mixed>> $investors */
/** @var \App\Helpers\Paginator $paginator */
$canWrite = Policy::can($user, 'master.investors.write');
?>
<div class="topbar">
  <h1>Investor</h1>
  <?php if ($canWrite): ?><a class="btn" href="/master/investors/create">+ Tambah Investor</a><?php endif; ?>
</div>

<form class="filters" method="get" action="/master/investors">
  <input type="text" name="search" placeholder="Cari kode/nama/email..." value="<?= e($search) ?>">
  <select name="status">
    <option value="">Semua Status</option>
    <option value="active" <?= $status === 'active' ? 'selected' : '' ?>>Aktif</option>
    <option value="inactive" <?= $status === 'inactive' ? 'selected' : '' ?>>Non-aktif</option>
  </select>
  <button class="btn secondary" type="submit">Filter</button>
</form>

<?php if ($investors === []): ?>
  <div class="empty-state">Belum ada data investor.</div>
<?php else: ?>
<table>
  <thead><tr><th>Kode</th><th>Nama</th><th>Email</th><th>Akun Login</th><th>Kepemilikan Aktif</th><th>Status</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($investors as $investor): ?>
    <tr>
      <td><?= e($investor['code']) ?></td>
      <td><a href="/master/investors/<?= e($investor['id']) ?>"><?= e($investor['full_name']) ?></a></td>
      <td><?= e($investor['email'] ?? '-') ?></td>
      <td><?php if ($investor['profile_id'] === null): ?><span class="badge warning">Belum memiliki akun login</span><?php else: ?><span class="badge active">Sudah terhubung</span><?php endif; ?></td>
      <td><?= (int) $investor['active_ownership_count'] ?></td>
      <td><span class="badge <?= e($investor['status']) ?>"><?= $investor['status'] === 'active' ? 'Aktif' : 'Non-aktif' ?></span></td>
      <td><?php if ($canWrite): ?><a href="/master/investors/<?= e($investor['id']) ?>/edit">Edit</a><?php endif; ?></td>
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
