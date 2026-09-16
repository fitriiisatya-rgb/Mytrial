<?php

use App\Helpers\Csrf;

/** @var array<string,string> $errors */
/** @var array<string,mixed> $old */
/** @var list<array<string,mixed>> $investors */
/** @var list<array<string,mixed>> $outlets */
/** @var list<array<string,mixed>> $allContracts */
?>
<h1>Catat Kepemilikan Investor</h1>
<p style="font-size:.85rem;color:#6b7280;">Setiap kepemilikan bersifat effective-dated dan tidak pernah menimpa riwayat lama - jika kepemilikan berubah, catat sebagai baris baru setelah mengakhiri baris lama (lihat halaman detail outlet/investor untuk riwayat lengkap).</p>

<form method="post" action="/master/ownerships">
  <?= Csrf::field() ?>
  <div class="field">
    <label for="investor_id">Investor</label>
    <select id="investor_id" name="investor_id" required>
      <option value="">-- pilih investor --</option>
      <?php foreach ($investors as $investor): ?>
        <option value="<?= e($investor['id']) ?>" <?= ($old['investor_id'] ?? '') === $investor['id'] ? 'selected' : '' ?>><?= e($investor['full_name']) ?></option>
      <?php endforeach; ?>
    </select>
    <?php if (isset($errors['investor_id'])): ?><div class="error"><?= e($errors['investor_id']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="outlet_id">Outlet</label>
    <select id="outlet_id" name="outlet_id" required onchange="pfsFilterContracts()">
      <option value="">-- pilih outlet --</option>
      <?php foreach ($outlets as $outlet): ?>
        <option value="<?= e($outlet['id']) ?>" <?= ($old['outlet_id'] ?? '') === $outlet['id'] ? 'selected' : '' ?>><?= e($outlet['name']) ?></option>
      <?php endforeach; ?>
    </select>
    <?php if (isset($errors['outlet_id'])): ?><div class="error"><?= e($errors['outlet_id']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="contract_id">Kontrak</label>
    <select id="contract_id" name="contract_id" required>
      <option value="">-- pilih outlet terlebih dahulu --</option>
    </select>
    <?php if (isset($errors['contract_id'])): ?><div class="error"><?= e($errors['contract_id']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="ownership_pct">Persentase Kepemilikan (%)</label>
    <input type="number" step="0.000001" min="0.000001" max="100" id="ownership_pct" name="ownership_pct" value="<?= e((string) ($old['ownership_pct'] ?? '')) ?>" required>
    <?php if (isset($errors['ownership_pct'])): ?><div class="error"><?= e($errors['ownership_pct']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="investment_amount">Nilai Investasi (Rp)</label>
    <input type="number" step="0.01" min="0" id="investment_amount" name="investment_amount" value="<?= e((string) ($old['investment_amount'] ?? '0')) ?>">
    <?php if (isset($errors['investment_amount'])): ?><div class="error"><?= e($errors['investment_amount']) ?></div><?php endif; ?>
  </div>
  <div class="field">
    <label for="effective_from">Berlaku Mulai</label>
    <input type="date" id="effective_from" name="effective_from" value="<?= e((string) ($old['effective_from'] ?? '')) ?>" required>
    <?php if (isset($errors['effective_from'])): ?><div class="error"><?= e($errors['effective_from']) ?></div><?php endif; ?>
  </div>
  <button class="btn" type="submit">Simpan</button>
  <a class="btn secondary" href="/master/ownerships">Batal</a>
</form>

<script>
  var pfsContracts = <?= json_encode($allContracts, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  var pfsOldContractId = <?= json_encode($old['contract_id'] ?? '', JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  function pfsFilterContracts() {
    var outletId = document.getElementById('outlet_id').value;
    var select = document.getElementById('contract_id');
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = outletId ? '-- pilih kontrak --' : '-- pilih outlet terlebih dahulu --';
    select.appendChild(placeholder);
    pfsContracts.filter(function (c) { return c.outlet_id === outletId; }).forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.contract_number;
      if (c.id === pfsOldContractId) { opt.selected = true; }
      select.appendChild(opt);
    });
  }
  pfsFilterContracts();
</script>
