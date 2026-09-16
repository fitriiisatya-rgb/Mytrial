<?php

use App\Helpers\Csrf;

/** @var array<string,mixed>|null $entity */
/** @var array<string,string> $errors */
/** @var array<string,mixed> $old */
$isEdit = $entity !== null;
$action = $isEdit ? '/master/entities/' . $entity['id'] : '/master/entities';
?>
<h1><?= $isEdit ? 'Edit Entitas' : 'Tambah Entitas' ?></h1>

<form method="post" action="<?= e($action) ?>">
  <?= Csrf::field() ?>
  <div class="field">
    <label for="code">Kode</label>
    <input type="text" id="code" name="code" value="<?= e($old['code'] ?? '') ?>" required maxlength="50">
    <?php if (isset($errors['code'])): ?><div class="error"><?= e($errors['code']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="name">Nama</label>
    <input type="text" id="name" name="name" value="<?= e($old['name'] ?? '') ?>" required maxlength="255">
    <?php if (isset($errors['name'])): ?><div class="error"><?= e($errors['name']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="status">Status</label>
    <select id="status" name="status">
      <option value="active" <?= ($old['status'] ?? 'active') === 'active' ? 'selected' : '' ?>>Aktif</option>
      <option value="inactive" <?= ($old['status'] ?? '') === 'inactive' ? 'selected' : '' ?>>Non-aktif</option>
    </select>
  </div>
  <button class="btn" type="submit">Simpan</button>
  <a class="btn secondary" href="/master/entities">Batal</a>
</form>
