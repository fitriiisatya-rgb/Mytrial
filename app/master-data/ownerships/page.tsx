import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { saveOwnership, toggleOwnershipActive } from "./actions";

export default async function OwnershipsPage({ searchParams }: { searchParams: { error?: string; edit?: string } }) {
  const { error, edit } = searchParams;
  const supabase = await createClient();
  const [{ data: ownerships }, { data: investors }, { data: outlets }, { data: contracts }] = await Promise.all([
    supabase
      .from("investor_ownerships")
      .select("*, investors(investor_code, full_name), outlets(outlet_code, outlet_name), partnership_contracts(contract_number)")
      .order("start_date", { ascending: false }),
    supabase.from("investors").select("id, investor_code, full_name").eq("status", "active").order("investor_code"),
    supabase.from("outlets").select("id, outlet_code, outlet_name").eq("active", true).order("outlet_code"),
    supabase
      .from("partnership_contracts")
      .select("id, contract_number, outlets(outlet_code)")
      .eq("active", true)
      .order("contract_number"),
  ]);
  const editing = edit ? ownerships?.find((o) => o.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <h2 className="text-lg font-semibold text-navy mb-4">Kepemilikan Investor</h2>
      <p className="text-xs text-gray-500 mb-4">
        Kepemilikan berlaku berdasarkan rentang tanggal (Koreksi #4) — untuk mengganti kepemilikan, akhiri baris
        lama (isi &quot;Berakhir&quot;) lalu tambah baris baru, jangan mengedit tanggal baris yang sudah lewat.
        Total kepemilikan aktif untuk satu outlet pada rentang tanggal yang sama tidak boleh melebihi 100% — database
        akan menolak jika melebihi.
      </p>

      <form
        action={saveOwnership}
        className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3"
      >
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Investor</label>
          <select
            name="investor_id"
            defaultValue={editing?.investor_id}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Pilih investor…</option>
            {investors?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.investor_code} — {i.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Outlet</label>
          <select
            name="outlet_id"
            defaultValue={editing?.outlet_id}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Pilih outlet…</option>
            {outlets?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.outlet_code} — {o.outlet_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kontrak</label>
          <select
            name="contract_id"
            defaultValue={editing?.contract_id}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Pilih kontrak…</option>
            {contracts?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.outlets?.outlet_code} — {c.contract_number}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">% Kepemilikan</label>
          <input
            type="number"
            step="0.000001"
            min="0"
            max="100"
            name="ownership_pct"
            defaultValue={editing?.ownership_pct}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nilai Investasi (Rp)</label>
          <input
            type="number"
            step="0.01"
            name="investment_amount"
            defaultValue={editing?.investment_amount ?? "0"}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
          Aktif
        </label>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Berlaku Sejak</label>
          <input
            type="date"
            name="start_date"
            defaultValue={editing?.start_date}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Berakhir (opsional)</label>
          <input
            type="date"
            name="end_date"
            defaultValue={editing?.end_date ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-3">
          <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
            {editing ? "Simpan" : "Tambah"}
          </button>
        </div>
      </form>

      <table className="w-full text-sm bg-white border border-border rounded-lg overflow-hidden">
        <thead className="bg-surface text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Investor</th>
            <th className="px-4 py-2">Outlet</th>
            <th className="px-4 py-2">Kontrak</th>
            <th className="px-4 py-2">%</th>
            <th className="px-4 py-2">Berlaku</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {ownerships?.map((o) => (
            <tr key={o.id} className="border-t border-border">
              <td className="px-4 py-2">
                {o.investors?.investor_code} — {o.investors?.full_name}
              </td>
              <td className="px-4 py-2">
                {o.outlets?.outlet_code} — {o.outlets?.outlet_name}
              </td>
              <td className="px-4 py-2">{o.partnership_contracts?.contract_number}</td>
              <td className="px-4 py-2">{o.ownership_pct}%</td>
              <td className="px-4 py-2">
                {o.start_date} → {o.end_date ?? "sekarang"}
              </td>
              <td className="px-4 py-2">{o.active ? "Aktif" : "Nonaktif"}</td>
              <td className="px-4 py-2 text-right space-x-3">
                <a href={`/master-data/ownerships?edit=${o.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleOwnershipActive} className="inline">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="active" value={String(o.active)} />
                  <button type="submit" className="text-gray-500 underline">
                    {o.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!ownerships?.length && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                Belum ada data, atau Anda tidak memiliki akses ke data ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
