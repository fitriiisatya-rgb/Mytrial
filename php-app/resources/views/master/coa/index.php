<?php

use App\Policies\Policy;

/** @var list<array<string,mixed>> $accounts */
/** @var \App\Helpers\Paginator $paginator */
$canWrite = Policy::can($user, 'master.coa.write');
$typeLabel = ['asset' => 'Aset', 'liability' => 'Liabilitas', 'equity' => 'Ekuitas', 'revenue' => 'Pendapatan', 'expense' => 'Beban'];
?>
<div class="topbar">
  <h1>Chart of Accounts</h1>
  <?php if ($canWrite): ?><a class="btn" href="/master/coa/create">+ Tambah Akun</a><?php endif; ?>
</div>

<form class="filters" method="get" action="/master/coa">
  <input type="text" name="search" placeholder="Cari kode/nama..." value="<?= e($search) ?>">
  <select name="account_type">
    <option value="">Semua Tipe</option>
    <?php foreach ($typeLabel as $val => $label): ?>
      <option value="<?= e($val) ?>" <?= $accountType === $val ? 'selected' : '' ?>><?= e($label) ?></option>
    <?php endforeach; ?>
  </select>
  <select name="status">
    <option value="">Semua Status</option>
    <option value="active" <?= $status === 'active' ? 'selected' : '' ?>>Aktif</option>
    <option value="inactive" <?= $status === 'inactive' ? 'selected' : '' ?>>Non-aktif</option>
  </select>
  <button class="btn secondary" type="submit">Filter</button>
</form>

<?php if ($accounts === []): ?>
  <div class="empty-state">Belum ada data akun COA.</div>
<?php else: ?>
<table>
  <thead><tr><th>Kode</th><th>Nama</th><th>Tipe</th><th>Parent</th><th>Normal</th><th>Status</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($accounts as $account): ?>
    <tr>
      <td><?= e($account['code']) ?></td>
      <td><a href="/master/coa/<?= e($account['id']) ?>"><?= e($account['name']) ?></a></td>
      <td><?= e($typeLabel[$account['account_type']] ?? $account['account_type']) ?></td>
      <td><?= $account['parent_name'] !== null ? e($account['parent_name']) : '-' ?></td>
      <td><?= $account['normal_balance'] === 'debit' ? 'Debit' : 'Kredit' ?></td>
      <td><span class="badge <?= $account['is_active'] ? 'active' : 'inactive' ?>"><?= $account['is_active'] ? 'Aktif' : 'Non-aktif' ?></span></td>
      <td><?php if ($canWrite): ?><a href="/master/coa/<?= e($account['id']) ?>/edit">Edit</a><?php endif; ?></td>
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
