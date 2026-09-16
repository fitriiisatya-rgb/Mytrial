<?php

use App\Policies\Policy;

/** @var list<array<string,mixed>> $ownerships */
/** @var \App\Helpers\Paginator $paginator */
$canWrite = Policy::can($user, 'master.ownerships.write');
?>
<div class="topbar">
  <h1>Kepemilikan Investor</h1>
  <?php if ($canWrite): ?><a class="btn" href="/master/ownerships/create">+ Catat Kepemilikan</a><?php endif; ?>
</div>

<form class="filters" method="get" action="/master/ownerships">
  <select name="investor_id">
    <option value="">Semua Investor</option>
    <?php foreach ($investors as $investor): ?>
      <option value="<?= e($investor['id']) ?>" <?= $investorId === $investor['id'] ? 'selected' : '' ?>><?= e($investor['full_name']) ?></option>
    <?php endforeach; ?>
  </select>
  <select name="outlet_id">
    <option value="">Semua Outlet</option>
    <?php foreach ($outlets as $outlet): ?>
      <option value="<?= e($outlet['id']) ?>" <?= $outletId === $outlet['id'] ? 'selected' : '' ?>><?= e($outlet['name']) ?></option>
    <?php endforeach; ?>
  </select>
  <select name="status">
    <option value="">Semua Status</option>
    <option value="active" <?= $status === 'active' ? 'selected' : '' ?>>Aktif</option>
    <option value="inactive" <?= $status === 'inactive' ? 'selected' : '' ?>>Berakhir</option>
  </select>
  <button class="btn secondary" type="submit">Filter</button>
</form>

<?php if ($ownerships === []): ?>
  <div class="empty-state">Belum ada data kepemilikan.</div>
<?php else: ?>
<table>
  <thead><tr><th>Investor</th><th>Outlet</th><th>%</th><th>Investasi</th><th>Periode</th><th>Status</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($ownerships as $row): ?>
    <tr>
      <td><a href="/master/investors/<?= e($row['investor_id']) ?>"><?= e($row['investor_name']) ?></a></td>
      <td><a href="/master/outlets/<?= e($row['outlet_id']) ?>"><?= e($row['outlet_name']) ?></a></td>
      <td><?= number_format((float) $row['ownership_pct'], 4) ?>%</td>
      <td>Rp <?= number_format((float) $row['investment_amount'], 2) ?></td>
      <td><?= e($row['effective_from']) ?> s/d <?= e($row['effective_to'] ?? 'sekarang') ?></td>
      <td><span class="badge <?= $row['is_active'] ? 'active' : 'inactive' ?>"><?= $row['is_active'] ? 'Aktif' : 'Berakhir' ?></span></td>
      <td><?php if ($canWrite && $row['is_active']): ?><a href="/master/ownerships/<?= e($row['id']) ?>/end">Akhiri</a><?php endif; ?></td>
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
