<?php

use App\Helpers\Csrf;

/** @var array<string,mixed>|null $contract */
/** @var array<string,string> $errors */
/** @var array<string,mixed> $old */
/** @var list<array<string,mixed>> $outlets */
$isEdit = $contract !== null;
$action = $isEdit ? '/master/contracts/' . $contract['id'] : '/master/contracts';
?>
<h1><?= $isEdit ? 'Edit Kontrak' : 'Tambah Kontrak' ?></h1>

<form method="post" action="<?= e($action) ?>">
  <?= Csrf::field() ?>
  <div class="field">
    <label for="outlet_id">Outlet</label>
    <select id="outlet_id" name="outlet_id" required>
      <option value="">-- pilih outlet --</option>
      <?php foreach ($outlets as $outlet): ?>
        <option value="<?= e($outlet['id']) ?>" <?= ($old['outlet_id'] ?? '') === $outlet['id'] ? 'selected' : '' ?>><?= e($outlet['name']) ?></option>
      <?php endforeach; ?>
    </select>
    <?php if (isset($errors['outlet_id'])): ?><div class="error"><?= e($errors['outlet_id']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="contract_number">Nomor Kontrak</label>
    <input type="text" id="contract_number" name="contract_number" value="<?= e($old['contract_number'] ?? '') ?>" required maxlength="100">
    <?php if (isset($errors['contract_number'])): ?><div class="error"><?= e($errors['contract_number']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="start_date">Tanggal Mulai</label>
    <input type="date" id="start_date" name="start_date" value="<?= e($old['start_date'] ?? '') ?>" required>
    <?php if (isset($errors['start_date'])): ?><div class="error"><?= e($errors['start_date']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="end_date">Tanggal Akhir</label>
    <input type="date" id="end_date" name="end_date" value="<?= e($old['end_date'] ?? '') ?>" required>
    <?php if (isset($errors['end_date'])): ?><div class="error"><?= e($errors['end_date']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="duration_months">Durasi (bulan)</label>
    <input type="number" id="duration_months" name="duration_months" value="<?= e((string) ($old['duration_months'] ?? 60)) ?>">
    <p style="font-size:.8rem;color:#6b7280;">Default 5 tahun (60 bulan) - bisa disesuaikan sesuai kebutuhan kontrak.</p>
  </div>
  <div class="field">
    <label for="total_investment">Total Investasi (Rp)</label>
    <input type="number" step="0.01" id="total_investment" name="total_investment" value="<?= e((string) ($old['total_investment'] ?? '0')) ?>" required>
    <?php if (isset($errors['total_investment'])): ?><div class="error"><?= e($errors['total_investment']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="profit_distribution_pct">% Distribusi Profit ke Investor</label>
    <input type="number" step="0.001" min="0" max="100" id="profit_distribution_pct" name="profit_distribution_pct" value="<?= e((string) ($old['profit_distribution_pct'] ?? '')) ?>" required>
    <?php if (isset($errors['profit_distribution_pct'])): ?><div class="error"><?= e($errors['profit_distribution_pct']) ?></div><?php endif; ?>
    <p style="font-size:.8rem;color:#6b7280;">Sisa (retained) dihitung otomatis: 100% - persentase ini.</p>
  </div>
  <div class="field">
    <label for="status">Status</label>
    <select id="status" name="status">
      <option value="active" <?= ($old['status'] ?? 'active') === 'active' ? 'selected' : '' ?>>Aktif</option>
      <option value="inactive" <?= ($old['status'] ?? '') === 'inactive' ? 'selected' : '' ?>>Non-aktif</option>
    </select>
  </div>
  <button class="btn" type="submit">Simpan</button>
  <a class="btn secondary" href="/master/contracts">Batal</a>
</form>
