"use client";

import { useState } from "react";
import { createManualJournal } from "@/app/journal/actions";
import { inputClass } from "@/components/master-data/form-field";

interface LineState {
  key: number;
  coaId: string;
  outletId: string;
  debit: string;
  credit: string;
  description: string;
}

let nextKey = 0;
function emptyLine(): LineState {
  return { key: nextKey++, coaId: "", outletId: "", debit: "", credit: "", description: "" };
}

/**
 * Spec P — Manual Journal: a client component only because dynamically
 * adding/removing lines needs local state; the actual balance
 * validation is server-side (buildManualJournal, lib/journal/
 * build-manual-journal.ts) — this preview total is a convenience, never
 * the authoritative check.
 */
export function ManualJournalForm({
  entities,
  coa,
  outlets,
}: {
  entities: { id: string; name: string }[];
  coa: { id: string; code: string; name: string }[];
  outlets: { id: string; outlet_name: string }[];
}) {
  const [lines, setLines] = useState<LineState[]>([emptyLine(), emptyLine()]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;

  function updateLine(key: number, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  return (
    <form action={createManualJournal} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Entitas</label>
          <select name="entity_id" required className={inputClass}>
            <option value="">Pilih entitas…</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tanggal</label>
          <input type="date" name="journal_date" required className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Deskripsi</label>
          <input type="text" name="description" placeholder="mis. Accrual bulan Agustus" className={inputClass} />
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">COA</th>
              <th className="px-3 py-2">Outlet</th>
              <th className="px-3 py-2">Deskripsi</th>
              <th className="px-3 py-2 text-right">Debit</th>
              <th className="px-3 py-2 text-right">Kredit</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-t border-border">
                <td className="px-3 py-2">
                  <select name="line_coa_id" required value={line.coaId} onChange={(e) => updateLine(line.key, { coaId: e.target.value })} className={inputClass}>
                    <option value="">Pilih COA…</option>
                    {coa.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select name="line_outlet_id" value={line.outletId} onChange={(e) => updateLine(line.key, { outletId: e.target.value })} className={inputClass}>
                    <option value="">—</option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.outlet_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input name="line_description" value={line.description} onChange={(e) => updateLine(line.key, { description: e.target.value })} className={inputClass} />
                </td>
                <td className="px-3 py-2">
                  <input
                    name="line_debit"
                    value={line.debit}
                    onChange={(e) => updateLine(line.key, { debit: e.target.value })}
                    placeholder="0"
                    className={`${inputClass} text-right`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    name="line_credit"
                    value={line.credit}
                    onChange={(e) => updateLine(line.key, { credit: e.target.value })}
                    placeholder="0"
                    className={`${inputClass} text-right`}
                  />
                </td>
                <td className="px-3 py-2">
                  {lines.length > 2 && (
                    <button type="button" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))} className="text-red-500 text-xs underline">
                      Hapus
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border font-semibold">
            <tr>
              <td className="px-3 py-2" colSpan={3}>
                Total
              </td>
              <td className="px-3 py-2 text-right">{totalDebit.toLocaleString("id-ID")}</td>
              <td className="px-3 py-2 text-right">{totalCredit.toLocaleString("id-ID")}</td>
              <td></td>
            </tr>
            <tr>
              <td className="px-3 py-2" colSpan={3}>
                Selisih
              </td>
              <td className="px-3 py-2 text-right" colSpan={2}>
                <span className={diff === 0 ? "text-green-700" : "text-red-700"}>{diff.toLocaleString("id-ID")}</span>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="border border-border rounded-lg px-4 py-2 text-sm">
          + Tambah Baris
        </button>
        <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
          Buat Jurnal Manual (Draft)
        </button>
      </div>
    </form>
  );
}
