<?php

use App\Helpers\Csrf;

/** @var string $token */
/** @var string $extension */
/** @var string $originalFilename */
/** @var string|null $entityId */
/** @var string|null $sourceName */
/** @var string $error */
/** @var array<int, list<string>> $previewRows */
/** @var int|null $currentHeaderRow */
?>
<h1>Pilih Baris Header</h1>
<div class="flash error"><?= e($error) ?></div>
<p style="color:#6b7280;font-size:.9rem;">Sistem tidak dapat menemukan baris header secara otomatis (atau kolom
  wajib tidak lengkap pada baris yang dipilih). Pilih baris yang berisi judul kolom (Bank / Tanggal / Unit /
  Klasifikasi / Deskripsi / Debit / Kredit / Saldo) dari data di bawah ini.</p>

<form method="post" action="/import/bank-expense/preview">
  <?= Csrf::field() ?>
  <input type="hidden" name="token" value="<?= e($token) ?>">
  <input type="hidden" name="extension" value="<?= e($extension) ?>">
  <input type="hidden" name="original_filename" value="<?= e($originalFilename) ?>">
  <input type="hidden" name="entity_id" value="<?= e($entityId) ?>">
  <input type="hidden" name="source_name" value="<?= e($sourceName) ?>">
  <input type="hidden" name="import_source_id" value="<?= e($importSourceId) ?>">

  <table>
    <thead><tr><th></th><th>Baris #</th><th>Isi</th></tr></thead>
    <tbody>
    <?php foreach ($previewRows as $index => $row): ?>
      <tr>
        <td><input type="radio" name="header_row_number" value="<?= (int) $index ?>" <?= $currentHeaderRow === $index ? 'checked' : '' ?> required></td>
        <td><?= (int) $index + 1 ?></td>
        <td style="font-size:.8rem;"><?= e(implode(' | ', $row)) ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>

  <div style="margin-top:1rem;">
    <button class="btn" type="submit">Gunakan Baris Ini &amp; Preview</button>
    <a class="btn secondary" href="/import/bank-expense">Batal</a>
  </div>
</form>
