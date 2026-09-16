<?php

use App\Helpers\Csrf;

/** @var array<string,mixed>|null $investor */
/** @var array<string,string> $errors */
/** @var array<string,mixed> $old */
/** @var list<array<string,mixed>> $profiles */
$isEdit = $investor !== null;
$action = $isEdit ? '/master/investors/' . $investor['id'] : '/master/investors';
?>
<h1><?= $isEdit ? 'Edit Investor' : 'Tambah Investor' ?></h1>

<form method="post" action="<?= e($action) ?>">
  <?= Csrf::field() ?>
  <div class="field">
    <label for="code">Kode</label>
    <input type="text" id="code" name="code" value="<?= e($old['code'] ?? '') ?>" required maxlength="50">
    <?php if (isset($errors['code'])): ?><div class="error"><?= e($errors['code']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="full_name">Nama Lengkap</label>
    <input type="text" id="full_name" name="full_name" value="<?= e($old['full_name'] ?? '') ?>" required maxlength="255">
    <?php if (isset($errors['full_name'])): ?><div class="error"><?= e($errors['full_name']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" value="<?= e($old['email'] ?? '') ?>">
    <?php if (isset($errors['email'])): ?><div class="error"><?= e($errors['email']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="phone">Telepon</label>
    <input type="text" id="phone" name="phone" value="<?= e($old['phone'] ?? '') ?>">
  </div>
  <div class="field">
    <label for="profile_id">Akun Login (opsional)</label>
    <select id="profile_id" name="profile_id">
      <option value="">-- belum memiliki akun login --</option>
      <?php foreach ($profiles as $profile): ?>
        <option value="<?= e($profile['id']) ?>" <?= ($old['profile_id'] ?? '') === $profile['id'] ? 'selected' : '' ?>><?= e($profile['name']) ?> (<?= e($profile['email']) ?>)</option>
      <?php endforeach; ?>
    </select>
    <?php if (isset($errors['profile_id'])): ?><div class="error"><?= e($errors['profile_id']) ?></div><?php endif; ?>
    <p style="font-size:.8rem;color:#6b7280;">Investor boleh dibuat tanpa akun login - dapat dihubungkan kemudian.</p>
  </div>
  <div class="field">
    <label for="status">Status</label>
    <select id="status" name="status">
      <option value="active" <?= ($old['status'] ?? 'active') === 'active' ? 'selected' : '' ?>>Aktif</option>
      <option value="inactive" <?= ($old['status'] ?? '') === 'inactive' ? 'selected' : '' ?>>Non-aktif</option>
    </select>
  </div>
  <button class="btn" type="submit">Simpan</button>
  <a class="btn secondary" href="/master/investors">Batal</a>
</form>
