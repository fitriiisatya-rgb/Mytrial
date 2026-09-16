<?php

use App\Helpers\Csrf;

/** @var array<string,mixed> $ownership */
/** @var array<string,string> $errors */
?>
<h1>Akhiri Kepemilikan</h1>
<p>Persentase: <strong><?= number_format((float) $ownership['ownership_pct'], 4) ?>%</strong>, berlaku sejak <strong><?= e($ownership['effective_from']) ?></strong>.</p>
<p style="font-size:.85rem;color:#6b7280;">Tindakan ini hanya menandai tanggal berakhir - data kepemilikan lama tetap tersimpan sebagai riwayat, tidak dihapus.</p>

<form method="post" action="/master/ownerships/<?= e($ownership['id']) ?>/end">
  <?= Csrf::field() ?>
  <div class="field">
    <label for="effective_to">Berlaku Sampai</label>
    <input type="date" id="effective_to" name="effective_to" required min="<?= e($ownership['effective_from']) ?>">
    <?php if (isset($errors['effective_to'])): ?><div class="error"><?= e($errors['effective_to']) ?></div><?php endif; ?>
  </div>
  <button class="btn" type="submit">Akhiri Kepemilikan</button>
  <a class="btn secondary" href="/master/ownerships">Batal</a>
</form>
