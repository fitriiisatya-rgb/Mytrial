<?php

use App\Policies\Policy;

/** @var array<string,mixed> $bank */
$canWrite = Policy::can($user, 'master.banks.write');
?>
<div class="topbar">
  <h1><?= e($bank['bank_name']) ?> <span class="badge <?= $bank['is_active'] ? 'active' : 'inactive' ?>"><?= $bank['is_active'] ? 'Aktif' : 'Non-aktif' ?></span></h1>
  <?php if ($canWrite): ?><a class="btn secondary" href="/master/banks/<?= e($bank['id']) ?>/edit">Edit</a><?php endif; ?>
</div>
<p>No Rekening: <strong><?= e($bank['account_number']) ?></strong></p>
<p>Atas Nama: <strong><?= e($bank['account_name']) ?></strong></p>
<p>Entitas: <?= e($bank['entity_name']) ?></p>
<p>Akun COA: <strong><?= e($bank['coa_code']) ?> - <?= e($bank['coa_name']) ?></strong></p>
<p><a href="/master/banks">&laquo; Kembali ke daftar rekening bank</a></p>
