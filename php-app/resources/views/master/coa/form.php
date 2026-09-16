<?php

use App\Helpers\Csrf;

/** @var array<string,mixed>|null $account */
/** @var array<string,string> $errors */
/** @var array<string,mixed> $old */
/** @var list<array<string,mixed>> $parents */
$isEdit = $account !== null;
$action = $isEdit ? '/master/coa/' . $account['id'] : '/master/coa';
$typeLabel = ['asset' => 'Aset', 'liability' => 'Liabilitas', 'equity' => 'Ekuitas', 'revenue' => 'Pendapatan', 'expense' => 'Beban'];
$pnlLabel = ['revenue' => 'Revenue', 'cogs' => 'COGS', 'opex' => 'Opex', 'other_income' => 'Other Income', 'other_expense' => 'Other Expense'];
?>
<h1><?= $isEdit ? 'Edit Akun COA' : 'Tambah Akun COA' ?></h1>

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
    <label for="account_type">Tipe Akun</label>
    <select id="account_type" name="account_type" required>
      <option value="">-- pilih tipe --</option>
      <?php foreach ($typeLabel as $val => $label): ?>
        <option value="<?= e($val) ?>" <?= ($old['account_type'] ?? '') === $val ? 'selected' : '' ?>><?= e($label) ?></option>
      <?php endforeach; ?>
    </select>
    <?php if (isset($errors['account_type'])): ?><div class="error"><?= e($errors['account_type']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="parent_id">Parent</label>
    <select id="parent_id" name="parent_id">
      <option value="">-- tidak ada (akun level atas) --</option>
      <?php foreach ($parents as $parent): ?>
        <?php if ($isEdit && $parent['id'] === $account['id']) continue; ?>
        <option value="<?= e($parent['id']) ?>" <?= ($old['parent_id'] ?? '') === $parent['id'] ? 'selected' : '' ?>><?= e($parent['code']) ?> - <?= e($parent['name']) ?></option>
      <?php endforeach; ?>
    </select>
    <?php if (isset($errors['parent_id'])): ?><div class="error"><?= e($errors['parent_id']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="normal_balance">Normal Balance</label>
    <select id="normal_balance" name="normal_balance" required>
      <option value="debit" <?= ($old['normal_balance'] ?? '') === 'debit' ? 'selected' : '' ?>>Debit</option>
      <option value="credit" <?= ($old['normal_balance'] ?? '') === 'credit' ? 'selected' : '' ?>>Kredit</option>
    </select>
    <?php if (isset($errors['normal_balance'])): ?><div class="error"><?= e($errors['normal_balance']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="pnl_category">Kategori P&amp;L</label>
    <select id="pnl_category" name="pnl_category">
      <option value="">-- neraca (bukan P&amp;L) --</option>
      <?php foreach ($pnlLabel as $val => $label): ?>
        <option value="<?= e($val) ?>" <?= ($old['pnl_category'] ?? '') === $val ? 'selected' : '' ?>><?= e($label) ?></option>
      <?php endforeach; ?>
    </select>
    <?php if (isset($errors['pnl_category'])): ?><div class="error"><?= e($errors['pnl_category']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="reporting_order">Urutan Laporan</label>
    <input type="number" id="reporting_order" name="reporting_order" value="<?= e((string) ($old['reporting_order'] ?? 0)) ?>">
  </div>
  <div class="field">
    <label><input type="checkbox" name="is_active" value="1" <?= ($old['is_active'] ?? true) ? 'checked' : '' ?>> Aktif</label>
  </div>
  <button class="btn" type="submit">Simpan</button>
  <a class="btn secondary" href="/master/coa">Batal</a>
</form>
