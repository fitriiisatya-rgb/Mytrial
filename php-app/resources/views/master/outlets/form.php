<?php

use App\Helpers\Csrf;

/** @var array<string,mixed>|null $outlet */
/** @var array<string,string> $errors */
/** @var array<string,mixed> $old */
/** @var list<array<string,mixed>> $entities */
$isEdit = $outlet !== null;
$action = $isEdit ? '/master/outlets/' . $outlet['id'] : '/master/outlets';
?>
<h1><?= $isEdit ? 'Edit Outlet' : 'Tambah Outlet' ?></h1>

<form method="post" action="<?= e($action) ?>">
  <?= Csrf::field() ?>
  <div class="field">
    <label for="entity_id">Entitas</label>
    <select id="entity_id" name="entity_id" required>
      <option value="">-- pilih entitas --</option>
      <?php foreach ($entities as $entity): ?>
        <option value="<?= e($entity['id']) ?>" <?= ($old['entity_id'] ?? '') === $entity['id'] ? 'selected' : '' ?>><?= e($entity['name']) ?></option>
      <?php endforeach; ?>
    </select>
    <?php if (isset($errors['entity_id'])): ?><div class="error"><?= e($errors['entity_id']) ?></div><?php endif; ?>
  </div>
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
    <label for="area">Area</label>
    <input type="text" id="area" name="area" value="<?= e($old['area'] ?? '') ?>">
  </div>
  <div class="field">
    <label for="address">Alamat</label>
    <textarea id="address" name="address" rows="2"><?= e($old['address'] ?? '') ?></textarea>
  </div>
  <div class="field">
    <label for="opening_date">Tanggal Buka</label>
    <input type="date" id="opening_date" name="opening_date" value="<?= e($old['opening_date'] ?? '') ?>">
  </div>
  <div class="field">
    <label for="partnership_start">Mulai Kemitraan</label>
    <input type="date" id="partnership_start" name="partnership_start" value="<?= e($old['partnership_start'] ?? '') ?>">
  </div>
  <div class="field">
    <label for="partnership_end">Akhir Kemitraan</label>
    <input type="date" id="partnership_end" name="partnership_end" value="<?= e($old['partnership_end'] ?? '') ?>">
  </div>
  <div class="field">
    <label for="status">Status</label>
    <select id="status" name="status">
      <option value="active" <?= ($old['status'] ?? 'active') === 'active' ? 'selected' : '' ?>>Aktif</option>
      <option value="inactive" <?= ($old['status'] ?? '') === 'inactive' ? 'selected' : '' ?>>Non-aktif</option>
    </select>
  </div>
  <button class="btn" type="submit">Simpan</button>
  <a class="btn secondary" href="/master/outlets">Batal</a>
</form>
