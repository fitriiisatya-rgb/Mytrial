<?php

use App\Policies\Policy;

/** @var array<string,mixed> $investor */
/** @var list<array<string,mixed>> $current */
/** @var list<array<string,mixed>> $history */
$canWrite = Policy::can($user, 'master.investors.write');
?>
<div class="topbar">
  <h1><?= e($investor['full_name']) ?> <span class="badge <?= e($investor['status']) ?>"><?= $investor['status'] === 'active' ? 'Aktif' : 'Non-aktif' ?></span></h1>
  <?php if ($canWrite): ?><a class="btn secondary" href="/master/investors/<?= e($investor['id']) ?>/edit">Edit</a><?php endif; ?>
</div>
<p>Kode: <strong><?= e($investor['code']) ?></strong></p>
<p>Email: <?= e($investor['email'] ?? '-') ?> &middot; Telepon: <?= e($investor['phone'] ?? '-') ?></p>
<p>Akun Login: <?php if ($investor['profile_id'] === null): ?><span class="badge warning">Belum memiliki akun login</span><?php else: ?><span class="badge active">Sudah terhubung</span><?php endif; ?></p>

<h2>Investasi Aktif</h2>
<?php if ($current === []): ?>
  <div class="empty-state">Tidak ada investasi aktif saat ini.</div>
<?php else: ?>
<table>
  <thead><tr><th>Outlet</th><th>%</th><th>Investasi</th><th>Mulai</th></tr></thead>
  <tbody>
  <?php foreach ($current as $row): ?>
    <tr>
      <td><a href="/master/outlets/<?= e($row['outlet_id']) ?>"><?= e($row['outlet_name']) ?></a></td>
      <td><?= number_format((float) $row['ownership_pct'], 4) ?>%</td>
      <td>Rp <?= number_format((float) $row['investment_amount'], 2) ?></td>
      <td><?= e($row['effective_from']) ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
<?php endif; ?>

<h2>Riwayat Investasi</h2>
<?php if ($history === []): ?>
  <div class="empty-state">Belum ada riwayat.</div>
<?php else: ?>
<table>
  <thead><tr><th>Outlet</th><th>%</th><th>Investasi</th><th>Periode</th><th>Status</th></tr></thead>
  <tbody>
  <?php foreach ($history as $row): ?>
    <tr>
      <td><?= e($row['outlet_name']) ?></td>
      <td><?= number_format((float) $row['ownership_pct'], 4) ?>%</td>
      <td>Rp <?= number_format((float) $row['investment_amount'], 2) ?></td>
      <td><?= e($row['effective_from']) ?> s/d <?= e($row['effective_to'] ?? 'sekarang') ?></td>
      <td><span class="badge <?= $row['is_active'] ? 'active' : 'inactive' ?>"><?= $row['is_active'] ? 'Aktif' : 'Berakhir' ?></span></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
<?php endif; ?>

<p><a href="/master/investors">&laquo; Kembali ke daftar investor</a></p>
