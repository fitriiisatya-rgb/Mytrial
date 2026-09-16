<?php

use App\Helpers\Csrf;

/** @var list<array<string,mixed>> $entities */
/** @var list<array<string,mixed>> $sources */
/** @var string|null $error */
?>
<div class="filters" style="margin-bottom:1.5rem;">
  <a class="btn" href="/import/bank-expense">Pengeluaran Bank</a>
  <a class="btn secondary" href="/import/revenue">Penerimaan</a>
  <a class="btn secondary" href="/import/history">Riwayat Import</a>
  <a class="btn secondary" href="/import/sources">Sumber Data</a>
</div>

<h1>Import Pengeluaran Bank</h1>
<p style="color:#6b7280;font-size:.9rem;">Unggah rekening koran (Buku Bank) dalam format CSV atau XLSX. File akan
  ditinjau pada halaman preview sebelum benar-benar disimpan ke database - tidak ada data yang tersimpan pada
  langkah ini.</p>

<?php if ($error !== null): ?>
  <div class="flash error"><?= e($error) ?></div>
<?php endif; ?>

<form method="post" action="/import/bank-expense/preview" enctype="multipart/form-data">
  <?= Csrf::field() ?>
  <div class="field">
    <label for="file">File CSV / XLSX</label>
    <input type="file" id="file" name="file" accept=".csv,.xlsx,.xls" required>
  </div>
  <div class="field">
    <label for="entity_id">Entitas (opsional)</label>
    <select id="entity_id" name="entity_id">
      <option value="">-- tidak dipilih --</option>
      <?php foreach ($entities as $entity): ?>
        <option value="<?= e($entity['id']) ?>"><?= e($entity['name']) ?></option>
      <?php endforeach; ?>
    </select>
  </div>
  <div class="field">
    <label for="import_source_id">Gunakan Sumber Data Tersimpan (opsional)</label>
    <select id="import_source_id" name="import_source_id">
      <option value="">-- tidak dipilih (deteksi kolom otomatis) --</option>
      <?php foreach ($sources as $source): ?>
        <option value="<?= e($source['id']) ?>"><?= e($source['name']) ?></option>
      <?php endforeach; ?>
    </select>
    <p style="font-size:.8rem;color:#6b7280;">Jika dipilih, pemetaan kolom yang tersimpan pada sumber ini dipakai
      langsung (baris header tetap dideteksi secara terpisah). Kelola sumber data di tab "Sumber Data".</p>
  </div>
  <div class="field">
    <label for="source_name">Nama Sumber (opsional, diisi otomatis jika sumber data dipilih)</label>
    <input type="text" id="source_name" name="source_name" maxlength="255" placeholder="misal: BCA Outlet A - Sept 2026">
  </div>
  <button class="btn" type="submit">Unggah &amp; Preview</button>
</form>
