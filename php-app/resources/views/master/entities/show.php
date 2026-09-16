<?php

use App\Policies\Policy;

/** @var array<string,mixed> $entity */
/** @var int $outletCount */
/** @var int $bankCount */
$canWrite = Policy::can($user, 'master.entities.write');
?>
<div class="topbar">
  <h1><?= e($entity['name']) ?> <span class="badge <?= e($entity['status']) ?>"><?= $entity['status'] === 'active' ? 'Aktif' : 'Non-aktif' ?></span></h1>
  <?php if ($canWrite): ?><a class="btn secondary" href="/master/entities/<?= e($entity['id']) ?>/edit">Edit</a><?php endif; ?>
</div>
<p>Kode: <strong><?= e($entity['code']) ?></strong></p>
<p>Jumlah Outlet: <strong><?= e((string) $outletCount) ?></strong></p>
<p>Jumlah Rekening Bank: <strong><?= e((string) $bankCount) ?></strong></p>
<p><a href="/master/entities">&laquo; Kembali ke daftar entitas</a></p>
