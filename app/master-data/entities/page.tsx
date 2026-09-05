import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { saveEntity, toggleEntityActive } from "./actions";

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string };
}) {
  const { error, edit } = searchParams;
  const supabase = await createClient();
  const { data: entities } = await supabase.from("entities").select("*").order("code");
  const editing = edit ? entities?.find((e) => e.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <h2 className="text-lg font-semibold text-navy mb-4">Entitas</h2>

      <form action={saveEntity} className="bg-white border border-border rounded-lg p-4 mb-6 flex gap-3 items-end">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kode</label>
          <input
            name="code"
            defaultValue={editing?.code}
            required
            className="border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama</label>
          <input
            name="name"
            defaultValue={editing?.name}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
          <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
          Aktif
        </label>
        <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
          {editing ? "Simpan" : "Tambah"}
        </button>
      </form>

      <table className="w-full text-sm bg-white border border-border rounded-lg overflow-hidden">
        <thead className="bg-surface text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Kode</th>
            <th className="px-4 py-2">Nama</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {entities?.map((e) => (
            <tr key={e.id} className="border-t border-border">
              <td className="px-4 py-2">{e.code}</td>
              <td className="px-4 py-2">{e.name}</td>
              <td className="px-4 py-2">{e.active ? "Aktif" : "Nonaktif"}</td>
              <td className="px-4 py-2 text-right space-x-3">
                <a href={`/master-data/entities?edit=${e.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleEntityActive} className="inline">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="active" value={String(e.active)} />
                  <button type="submit" className="text-gray-500 underline">
                    {e.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!entities?.length && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                Belum ada data, atau Anda tidak memiliki akses ke data ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
