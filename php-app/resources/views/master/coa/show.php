<?php

use App\Policies\Policy;

/** @var array<string,mixed> $account */
/** @var list<array<string,mixed>> $children */
$canWrite = Policy::can($user, 'master.coa.write');
$typeLabel = ['asset' => 'Aset', 'liability' => 'Liabilitas', 'equity' => 'Ekuitas', 'revenue' => 'Pendapatan', 'expense' => 'Beban'];
?>
<div class="topbar">
  <h1><?= e($account['code']) ?> - <?= e($account['name']) ?> <span class="badge <?= $account['is_active'] ? 'active' : 'inactive' ?>"><?= $account['is_active'] ? 'Aktif' : 'Non-aktif' ?></span></h1>
  <?php if ($canWrite): ?><a class="btn secondary" href="/master/coa/<?= e($account['id']) ?>/edit">Edit</a><?php endif; ?>
</div>
<p>Tipe: <strong><?= e($typeLabel[$account['account_type']] ?? $account['account_type']) ?></strong> &middot; Normal Balance: <strong><?= $account['normal_balance'] === 'debit' ? 'Debit' : 'Kredit' ?></strong></p>
<p>Parent: <?= $account['parent_name'] !== null ? e($account['parent_name']) : '- (akun level atas)' ?></p>
<p>Kategori P&amp;L: <?= e($account['pnl_category'] ?? '- (neraca)') ?></p>

<h2>Sub-akun</h2>
<?php if ($children === []): ?>
  <div class="empty-state">Tidak ada sub-akun.</div>
<?php else: ?>
<table>
  <thead><tr><th>Kode</th><th>Nama</th><th>Status</th></tr></thead>
  <tbody>
  <?php foreach ($children as $child): ?>
    <tr>
      <td><?= e($child['code']) ?></td>
      <td><a href="/master/coa/<?= e($child['id']) ?>"><?= e($child['name']) ?></a></td>
      <td><span class="badge <?= $child['is_active'] ? 'active' : 'inactive' ?>"><?= $child['is_active'] ? 'Aktif' : 'Non-aktif' ?></span></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
<?php endif; ?>

<p><a href="/master/coa">&laquo; Kembali ke daftar COA</a></p>
