"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BANK_EXPENSE_MAPPING } from "@/lib/import/column-mapping";
import { previewBankExpenseImport, commitBankExpenseImport, type BankImportPreview } from "@/app/import/bank-expense/actions";

const STATUS_LABELS: Record<string, string> = {
  expense_candidate: "Kandidat Pengeluaran",
  debit_only_ignored: "Debit saja (diabaikan)",
  bank_not_found: "Bank tidak dikenali",
  invalid_date: "Tanggal tidak valid",
  invalid_amount: "Nominal tidak valid",
  malformed_row: "Baris tidak sesuai format",
  duplicate_exact: "Duplikat persis (dilewati)",
  duplicate_suspected: "Diduga duplikat (perlu ditinjau)",
};

export function BankExpenseWizard({ entities }: { entities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [entityId, setEntityId] = useState("");
  const [showMapping, setShowMapping] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<BankImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buildFormData() {
    const fd = new FormData();
    if (file) fd.append("file", file);
    fd.append("entity_id", entityId);
    for (const [k, v] of Object.entries(overrides)) {
      if (v.trim()) fd.append(`map_${k}`, v.trim());
    }
    return fd;
  }

  function handlePreview() {
    setError(null);
    if (!file || !entityId) {
      setError("Pilih entitas dan file terlebih dahulu.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await previewBankExpenseImport(buildFormData());
        if (result.missingRequired.length > 0) {
          setError(
            `Kolom wajib tidak ditemukan: ${result.missingRequired.join(", ")}. Header yang terdeteksi di file: ${result.headers.join(", ") || "(tidak ada)"}. Gunakan pemetaan kolom di bawah.`
          );
          setShowMapping(true);
          return;
        }
        setPreview(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const { batchId } = await commitBankExpenseImport(buildFormData());
        router.push(`/import/bank-expense/${batchId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  if (preview) {
    const s = preview.summary;
    return (
      <div>
        <h3 className="text-sm font-semibold text-navy mb-3">Preview Import — {file?.name}</h3>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <Stat label="Total Baris" value={s.totalRows} />
          <Stat label="Kandidat Pengeluaran" value={s.expenseCandidates} highlight="success" />
          <Stat label="Debit Saja (Diabaikan)" value={s.debitOnlyIgnored} />
          <Stat label="Bank Tidak Dikenali" value={s.bankNotFound} highlight={s.bankNotFound > 0 ? "warning" : undefined} />
          <Stat label="Tanggal Tidak Valid" value={s.invalidDate} highlight={s.invalidDate > 0 ? "danger" : undefined} />
          <Stat label="Nominal Tidak Valid" value={s.invalidAmount} highlight={s.invalidAmount > 0 ? "danger" : undefined} />
          <Stat label="Duplikat (Dilewati)" value={s.duplicateExact} />
          <Stat label="Diduga Duplikat" value={s.duplicateSuspected} highlight={s.duplicateSuspected > 0 ? "warning" : undefined} />
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <p className="text-xs text-gray-500 mb-2">Contoh {preview.sample.length} baris pertama:</p>
        <div className="bg-white border border-border rounded-lg overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead className="bg-surface text-left uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Bank</th>
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Deskripsi</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Kredit</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((r) => (
                <tr key={r.rowNumber} className="border-t border-border">
                  <td className="px-3 py-1.5">{r.rowNumber}</td>
                  <td className="px-3 py-1.5">{r.bankLabel}</td>
                  <td className="px-3 py-1.5">{r.date ?? "—"}</td>
                  <td className="px-3 py-1.5">{r.description ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right">{r.debit}</td>
                  <td className="px-3 py-1.5 text-right">{r.credit}</td>
                  <td className="px-3 py-1.5">{STATUS_LABELS[r.status] ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={pending}
            className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {pending ? "Memproses…" : "Confirm Import"}
          </button>
          <button
            onClick={() => setPreview(null)}
            disabled={pending}
            className="border border-border rounded-lg px-4 py-2 text-sm text-gray-600"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-lg p-4 max-w-2xl">
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Entitas</label>
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Pilih entitas…</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">File Buku Bank (CSV/Excel)</label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>
      </div>

      <button type="button" onClick={() => setShowMapping((v) => !v)} className="text-xs text-navy underline mb-3">
        {showMapping ? "Sembunyikan" : "Nama kolom berbeda? Atur pemetaan kolom"}
      </button>

      {showMapping && (
        <div className="grid grid-cols-3 gap-2 mb-3 border border-border rounded-lg p-3 bg-surface">
          {BANK_EXPENSE_MAPPING.map((col) => (
            <div key={col.field}>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">
                {col.label} {col.required && <span className="text-red-500">*</span>}
              </label>
              <input
                placeholder={col.defaultHeaders[0]}
                value={overrides[col.field] ?? ""}
                onChange={(e) => setOverrides((prev) => ({ ...prev, [col.field]: e.target.value }))}
                className="w-full border border-border rounded px-2 py-1 text-xs"
              />
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handlePreview}
        disabled={pending}
        className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Memproses…" : "Preview Import"}
      </button>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: "success" | "warning" | "danger" }) {
  const color =
    highlight === "success" ? "text-green-700" : highlight === "warning" ? "text-amber-700" : highlight === "danger" ? "text-red-700" : "text-navy";
  return (
    <div className="bg-white border border-border rounded-lg p-3">
      <p className="text-[10px] uppercase text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
