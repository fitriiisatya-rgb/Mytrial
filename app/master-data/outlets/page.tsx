import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { saveOutlet, toggleOutletActive } from "./actions";

export default async function OutletsPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string };
}) {
  const { error, edit } = searchParams;
  const supabase = await createClient();
  const [{ data: outlets }, { data: entities }] = await Promise.all([
    supabase.from("outlets").select("*, entities(name)").order("outlet_code"),
    supabase.from("entities").select("id, name").eq("active", true).order("name"),
  ]);
  const editing = edit ? outlets?.find((o) => o.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <h2 className="text-lg font-semibold text-navy mb-4">Outlet</h2>

      <form action={saveOutlet} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Entitas</label>
          <select
            name="entity_id"
            defaultValue={editing?.entity_id}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Pilih entitas…</option>
            {entities?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kode Outlet</label>
          <input
            name="outlet_code"
            defaultValue={editing?.outlet_code}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama Outlet</label>
          <input
            name="outlet_name"
            defaultValue={editing?.outlet_name}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Area</label>
          <input
            name="area"
            defaultValue={editing?.area ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Alamat</label>
          <input
            name="address"
            defaultValue={editing?.address ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mulai Kemitraan</label>
          <input
            type="date"
            name="partnership_start"
            defaultValue={editing?.partnership_start ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Akhir Kemitraan</label>
          <input
            type="date"
            name="partnership_end"
            defaultValue={editing?.partnership_end ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tanggal Buka</label>
          <input
            type="date"
            name="opening_date"
            defaultValue={editing?.opening_date ?? ""}
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
            <th className="px-4 py-2">Kode</th>
            <th className="px-4 py-2">Nama</th>
            <th className="px-4 py-2">Entitas</th>
            <th className="px-4 py-2">Area</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {outlets?.map((o) => (
            <tr key={o.id} className="border-t border-border">
              <td className="px-4 py-2">{o.outlet_code}</td>
              <td className="px-4 py-2">{o.outlet_name}</td>
              <td className="px-4 py-2">{o.entities?.name}</td>
              <td className="px-4 py-2">{o.area ?? "—"}</td>
              <td className="px-4 py-2">{o.active ? "Aktif" : "Nonaktif"}</td>
              <td className="px-4 py-2 text-right space-x-3">
                <a href={`/master-data/outlets?edit=${o.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleOutletActive} className="inline">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="active" value={String(o.active)} />
                  <button type="submit" className="text-gray-500 underline">
                    {o.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!outlets?.length && (
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
