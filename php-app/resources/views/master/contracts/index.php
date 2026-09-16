<?php

use App\Policies\Policy;

/** @var list<array<string,mixed>> $contracts */
/** @var \App\Helpers\Paginator $paginator */
$canWrite = Policy::can($user, 'master.contracts.write');
?>
<div class="topbar">
  <h1>Kontrak Kemitraan</h1>
  <?php if ($canWrite): ?><a class="btn" href="/master/contracts/create">+ Tambah Kontrak</a><?php endif; ?>
</div>

<form class="filters" method="get" action="/master/contracts">
  <input type="text" name="search" placeholder="Cari no kontrak..." value="<?= e($search) ?>">
  <select name="outlet_id">
    <option value="">Semua Outlet</option>
    <?php foreach ($outlets as $outlet): ?>
      <option value="<?= e($outlet['id']) ?>" <?= $outletId === $outlet['id'] ? 'selected' : '' ?>><?= e($outlet['name']) ?></option>
    <?php endforeach; ?>
  </select>
  <select name="status">
    <option value="">Semua Status</option>
    <option value="active" <?= $status === 'active' ? 'selected' : '' ?>>Aktif</option>
    <option value="inactive" <?= $status === 'inactive' ? 'selected' : '' ?>>Non-aktif</option>
  </select>
  <button class="btn secondary" type="submit">Filter</button>
</form>

<?php if ($contracts === []): ?>
  <div class="empty-state">Belum ada data kontrak.</div>
<?php else: ?>
<table>
  <thead><tr><th>No Kontrak</th><th>Outlet</th><th>Periode</th><th>Distribusi</th><th>Investasi</th><th>Status</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($contracts as $contract): ?>
    <tr>
      <td><a href="/master/contracts/<?= e($contract['id']) ?>"><?= e($contract['contract_number']) ?></a></td>
      <td><?= e($contract['outlet_name']) ?></td>
      <td><?= e($contract['start_date']) ?> s/d <?= e($contract['end_date']) ?></td>
      <td><?= number_format((float) $contract['profit_distribution_pct'], 2) ?>% / <?= number_format((float) $contract['retained_profit_pct'], 2) ?>%</td>
      <td>Rp <?= number_format((float) $contract['total_investment'], 2) ?></td>
      <td><span class="badge <?= e($contract['status']) ?>"><?= $contract['status'] === 'active' ? 'Aktif' : 'Non-aktif' ?></span></td>
      <td><?php if ($canWrite): ?><a href="/master/contracts/<?= e($contract['id']) ?>/edit">Edit</a><?php endif; ?></td>
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
