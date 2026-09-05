import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { saveContract, toggleContractActive } from "./actions";

export default async function ContractsPage({ searchParams }: { searchParams: { error?: string; edit?: string } }) {
  const { error, edit } = searchParams;
  const supabase = await createClient();
  const [{ data: contracts }, { data: outlets }] = await Promise.all([
    supabase.from("partnership_contracts").select("*, outlets(outlet_code, outlet_name)").order("contract_number"),
    supabase.from("outlets").select("id, outlet_code, outlet_name").eq("active", true).order("outlet_code"),
  ]);
  const editing = edit ? contracts?.find((c) => c.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <h2 className="text-lg font-semibold text-navy mb-4">Kontrak Kemitraan</h2>

      <form
        action={saveContract}
        className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3"
      >
        {editing && <input type="hidden" name="id" value={editing.id} />}
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
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">No. Kontrak</label>
          <input
            name="contract_number"
            defaultValue={editing?.contract_number}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Durasi (bulan)</label>
          <input
            type="number"
            name="duration_months"
            defaultValue={editing?.duration_months ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mulai</label>
          <input
            type="date"
            name="start_date"
            defaultValue={editing?.start_date}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Berakhir</label>
          <input
            type="date"
            name="end_date"
            defaultValue={editing?.end_date}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Total Investasi (Rp)</label>
          <input
            type="number"
            step="0.01"
            name="total_investment"
            defaultValue={editing?.total_investment ?? "0"}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
            % Bagi Hasil ke Investor
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            max="100"
            name="profit_distribution_pct"
            defaultValue={editing?.profit_distribution_pct}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
          Aktif
        </label>
        <div className="col-span-3">
          <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
            {editing ? "Simpan" : "Tambah"}
          </button>
        </div>
      </form>

      <table className="w-full text-sm bg-white border border-border rounded-lg overflow-hidden">
        <thead className="bg-surface text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">No. Kontrak</th>
            <th className="px-4 py-2">Outlet</th>
            <th className="px-4 py-2">Periode</th>
            <th className="px-4 py-2">% Investor / % Ditahan</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {contracts?.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="px-4 py-2">{c.contract_number}</td>
              <td className="px-4 py-2">
                {c.outlets?.outlet_code} — {c.outlets?.outlet_name}
              </td>
              <td className="px-4 py-2">
                {c.start_date} → {c.end_date}
              </td>
              <td className="px-4 py-2">
                {c.profit_distribution_pct}% / {c.retained_profit_pct}%
              </td>
              <td className="px-4 py-2">{c.active ? "Aktif" : "Nonaktif"}</td>
              <td className="px-4 py-2 text-right space-x-3">
                <a href={`/master-data/contracts?edit=${c.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleContractActive} className="inline">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={String(c.active)} />
                  <button type="submit" className="text-gray-500 underline">
                    {c.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!contracts?.length && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                Belum ada data, atau Anda tidak memiliki akses ke data ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
