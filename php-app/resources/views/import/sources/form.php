<?php

use App\Helpers\Csrf;

/** @var array<string,mixed>|null $source */
/** @var array<string,string> $errors */
/** @var array<string,mixed> $old */
/** @var list<array<string,mixed>> $entities */
$isEdit = $source !== null;
$action = $isEdit ? '/import/sources/' . $source['id'] : '/import/sources';
?>
<h1><?= $isEdit ? 'Edit Sumber Data' : 'Tambah Sumber Data' ?></h1>

<form method="post" action="<?= e($action) ?>">
  <?= Csrf::field() ?>
  <div class="field">
    <label for="source_type">Tipe Sumber</label>
    <select id="source_type" name="source_type" required>
      <option value="">-- pilih tipe --</option>
      <option value="bank_expense" <?= ($old['source_type'] ?? '') === 'bank_expense' ? 'selected' : '' ?>>Pengeluaran Bank</option>
      <option value="revenue" <?= ($old['source_type'] ?? '') === 'revenue' ? 'selected' : '' ?>>Penerimaan</option>
    </select>
    <?php if (isset($errors['source_type'])): ?><div class="error"><?= e($errors['source_type']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="name">Nama Sumber</label>
    <input type="text" id="name" name="name" value="<?= e($old['name'] ?? '') ?>" required maxlength="255" placeholder="misal: Buku Bank BCA Operasional">
    <?php if (isset($errors['name'])): ?><div class="error"><?= e($errors['name']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="entity_id">Entitas (opsional)</label>
    <select id="entity_id" name="entity_id">
      <option value="">-- tidak dipilih --</option>
      <?php foreach ($entities as $entity): ?>
        <option value="<?= e($entity['id']) ?>" <?= ($old['entity_id'] ?? '') === $entity['id'] ? 'selected' : '' ?>><?= e($entity['name']) ?></option>
      <?php endforeach; ?>
    </select>
  </div>
  <div class="field">
    <label for="column_mapping">Pemetaan Kolom (opsional, JSON)</label>
    <textarea id="column_mapping" name="column_mapping" rows="4" style="max-width:600px;font-family:monospace;" placeholder='{"bank": 0, "tanggal": 1, "unit": 2, "klasifikasi": 3, "deskripsi": 4, "debit": 5, "kredit": 6, "saldo": 7}'><?= e(is_array($old['column_mapping'] ?? null) ? json_encode($old['column_mapping'], JSON_UNESCAPED_UNICODE) : ($old['column_mapping'] ?? '')) ?></textarea>
    <?php if (isset($errors['column_mapping'])): ?><div class="error"><?= e($errors['column_mapping']) ?></div><?php endif; ?>
    <p style="font-size:.8rem;color:#6b7280;">Kosongkan untuk memakai deteksi otomatis berdasarkan nama kolom.
      Jika diisi, setiap field wajib untuk tipe sumber ini harus punya nilai (indeks kolom, dimulai dari 0) atau
      null.</p>
  </div>
  <div class="field">
    <label><input type="checkbox" name="is_active" value="1" <?= ($old['is_active'] ?? true) ? 'checked' : '' ?>> Aktif</label>
  </div>
  <button class="btn" type="submit">Simpan</button>
  <a class="btn secondary" href="/import/sources">Batal</a>
</form>
