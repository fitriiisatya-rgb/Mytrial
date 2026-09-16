<?php

use App\Policies\Policy;

/** @var array<string,mixed> $outlet */
/** @var list<array<string,mixed>> $currentOwnership */
/** @var float $totalPct */
/** @var string $indicator */
/** @var list<array<string,mixed>> $history */
$canWrite = Policy::can($user, 'master.outlets.write');
$indicatorLabel = ['valid' => 'Tepat 100%', 'warning' => 'Kurang dari 100%', 'invalid' => 'Melebihi 100%'];
$indicatorBadge = ['valid' => 'active', 'warning' => 'warning', 'invalid' => 'invalid'];
?>
<div class="topbar">
  <h1><?= e($outlet['name']) ?> <span class="badge <?= e($outlet['status']) ?>"><?= $outlet['status'] === 'active' ? 'Aktif' : 'Non-aktif' ?></span></h1>
  <?php if ($canWrite): ?><a class="btn secondary" href="/master/outlets/<?= e($outlet['id']) ?>/edit">Edit</a><?php endif; ?>
</div>
<p>Kode: <strong><?= e($outlet['code']) ?></strong> &middot; Entitas: <strong><?= e($outlet['entity_name']) ?></strong></p>
<p>Area: <?= e($outlet['area'] ?? '-') ?></p>
<p>Partnership: <?= e($outlet['partnership_start'] ?? '-') ?> s/d <?= e($outlet['partnership_end'] ?? '-') ?></p>
<p>Jumlah Investor Aktif: <strong><?= count($currentOwnership) ?></strong></p>
<p>Total Kepemilikan: <span class="badge <?= $indicatorBadge[$indicator] ?>"><?= number_format($totalPct, 2) ?>% (<?= $indicatorLabel[$indicator] ?>)</span></p>

<h2>Kepemilikan Saat Ini <?php if (\App\Policies\Policy::can($user, 'master.ownerships.write')): ?><a class="btn secondary" style="font-size:.75rem;padding:.2rem .5rem;" href="/master/ownerships/create?outlet_id=<?= e($outlet['id']) ?>">+ Catat Kepemilikan</a><?php endif; ?></h2>
<?php if ($currentOwnership === []): ?>
  <div class="empty-state">Belum ada investor aktif di outlet ini.</div>
<?php else: ?>
<table>
  <thead><tr><th>Investor</th><th>%</th><th>Investasi</th><th>Mulai</th></tr></thead>
  <tbody>
  <?php foreach ($currentOwnership as $row): ?>
    <tr>
      <td><a href="/master/investors/<?= e($row['investor_id']) ?>"><?= e($row['investor_name']) ?></a></td>
      <td><?= number_format((float) $row['ownership_pct'], 4) ?>%</td>
      <td>Rp <?= number_format((float) $row['investment_amount'], 2) ?></td>
      <td><?= e($row['effective_from']) ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
<?php endif; ?>

<h2>Riwayat Kepemilikan</h2>
<?php if ($history === []): ?>
  <div class="empty-state">Belum ada riwayat.</div>
<?php else: ?>
<table>
  <thead><tr><th>Investor</th><th>%</th><th>Investasi</th><th>Periode</th><th>Status</th></tr></thead>
  <tbody>
  <?php foreach ($history as $row): ?>
    <tr>
      <td><?= e($row['investor_name']) ?></td>
      <td><?= number_format((float) $row['ownership_pct'], 4) ?>%</td>
      <td>Rp <?= number_format((float) $row['investment_amount'], 2) ?></td>
      <td><?= e($row['effective_from']) ?> s/d <?= e($row['effective_to'] ?? 'sekarang') ?></td>
      <td><span class="badge <?= $row['is_active'] ? 'active' : 'inactive' ?>"><?= $row['is_active'] ? 'Aktif' : 'Berakhir' ?></span></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
<?php endif; ?>

<p><a href="/master/outlets">&laquo; Kembali ke daftar outlet</a></p>
