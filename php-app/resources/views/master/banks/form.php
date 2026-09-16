<?php

use App\Helpers\Csrf;

/** @var array<string,mixed>|null $bank */
/** @var array<string,string> $errors */
/** @var array<string,mixed> $old */
/** @var list<array<string,mixed>> $entities */
/** @var list<array<string,mixed>> $coaOptions */
$isEdit = $bank !== null;
$action = $isEdit ? '/master/banks/' . $bank['id'] : '/master/banks';
?>
<h1><?= $isEdit ? 'Edit Rekening Bank' : 'Tambah Rekening Bank' ?></h1>

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
    <label for="bank_name">Nama Bank</label>
    <input type="text" id="bank_name" name="bank_name" value="<?= e($old['bank_name'] ?? '') ?>" required maxlength="255">
    <?php if (isset($errors['bank_name'])): ?><div class="error"><?= e($errors['bank_name']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="account_number">Nomor Rekening</label>
    <input type="text" id="account_number" name="account_number" value="<?= e($old['account_number'] ?? '') ?>" required maxlength="100">
    <?php if (isset($errors['account_number'])): ?><div class="error"><?= e($errors['account_number']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="account_name">Atas Nama</label>
    <input type="text" id="account_name" name="account_name" value="<?= e($old['account_name'] ?? '') ?>" required maxlength="255">
    <?php if (isset($errors['account_name'])): ?><div class="error"><?= e($errors['account_name']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="coa_id">COA (wajib, khusus untuk rekening ini)</label>
    <select id="coa_id" name="coa_id" required>
      <option value="">-- pilih akun COA --</option>
      <?php foreach ($coaOptions as $coa): ?>
        <option value="<?= e($coa['id']) ?>" <?= ($old['coa_id'] ?? '') === $coa['id'] ? 'selected' : '' ?>><?= e($coa['code']) ?> - <?= e($coa['name']) ?></option>
      <?php endforeach; ?>
    </select>
    <?php if (isset($errors['coa_id'])): ?><div class="error"><?= e($errors['coa_id']) ?></div><?php endif; ?>
    <p style="font-size:.8rem;color:#6b7280;">Setiap rekening bank wajib punya akun COA sendiri - tidak boleh berbagi COA generik dengan rekening lain.</p>
  </div>
  <div class="field">
    <label><input type="checkbox" name="is_active" value="1" <?= ($old['is_active'] ?? true) ? 'checked' : '' ?>> Aktif</label>
  </div>
  <button class="btn" type="submit">Simpan</button>
  <a class="btn secondary" href="/master/banks">Batal</a>
</form>
