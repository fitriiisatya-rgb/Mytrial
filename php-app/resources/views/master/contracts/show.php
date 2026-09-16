<?php

use App\Policies\Policy;

/** @var array<string,mixed> $contract */
$canWrite = Policy::can($user, 'master.contracts.write');
?>
<div class="topbar">
  <h1><?= e($contract['contract_number']) ?> <span class="badge <?= e($contract['status']) ?>"><?= $contract['status'] === 'active' ? 'Aktif' : 'Non-aktif' ?></span></h1>
  <?php if ($canWrite): ?><a class="btn secondary" href="/master/contracts/<?= e($contract['id']) ?>/edit">Edit</a><?php endif; ?>
</div>
<p>Outlet: <a href="/master/outlets/<?= e($contract['outlet_id']) ?>"><?= e($contract['outlet_name']) ?></a></p>
<p>Periode: <?= e($contract['start_date']) ?> s/d <?= e($contract['end_date']) ?> (<?= e((string) ($contract['duration_months'] ?? '-')) ?> bulan)</p>
<p>Total Investasi: <strong>Rp <?= number_format((float) $contract['total_investment'], 2) ?></strong></p>
<p>Distribusi Profit: <strong><?= number_format((float) $contract['profit_distribution_pct'], 3) ?>%</strong> ke investor, <strong><?= number_format((float) $contract['retained_profit_pct'], 3) ?>%</strong> ditahan perusahaan</p>
<p><a href="/master/contracts">&laquo; Kembali ke daftar kontrak</a></p>
