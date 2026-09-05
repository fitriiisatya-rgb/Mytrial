import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { saveBank, toggleBankActive } from "./actions";

export default async function BanksPage({ searchParams }: { searchParams: { error?: string; edit?: string } }) {
  const { error, edit } = searchParams;
  const supabase = await createClient();
  const [{ data: banks }, { data: entities }, { data: coaOptions }] = await Promise.all([
    supabase.from("banks").select("*, entities(name), coa(code, name)").order("bank_name"),
    supabase.from("entities").select("id, name").eq("active", true).order("name"),
    supabase.from("coa").select("id, code, name").eq("account_type", "asset").eq("active", true).order("code"),
  ]);
  const editing = edit ? banks?.find((b) => b.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <h2 className="text-lg font-semibold text-navy mb-4">Rekening Bank</h2>
      <p className="text-xs text-gray-500 mb-4">
        Setiap rekening wajib memiliki COA sendiri (Koreksi #1) — jurnal pengeluaran mengkredit akun ini, tidak
        pernah akun kas/bank generik.
      </p>

      <form action={saveBank} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
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
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama Bank</label>
          <input
            name="bank_name"
            defaultValue={editing?.bank_name}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">No. Rekening</label>
          <input
            name="account_no"
            defaultValue={editing?.account_no}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama Pemilik Rekening</label>
          <input
            name="account_name"
            defaultValue={editing?.account_name}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
            COA Khusus Rekening Ini <span className="text-red-500">*wajib</span>
          </label>
          <select
            name="coa_id"
            defaultValue={editing?.coa_id}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Pilih akun COA…</option>
            {coaOptions?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
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
            <th className="px-4 py-2">Bank</th>
            <th className="px-4 py-2">No. Rekening</th>
            <th className="px-4 py-2">Entitas</th>
            <th className="px-4 py-2">COA</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {banks?.map((b) => (
            <tr key={b.id} className="border-t border-border">
              <td className="px-4 py-2">{b.bank_name}</td>
              <td className="px-4 py-2">{b.account_no}</td>
              <td className="px-4 py-2">{b.entities?.name}</td>
              <td className="px-4 py-2">
                {b.coa?.code} — {b.coa?.name}
              </td>
              <td className="px-4 py-2">{b.active ? "Aktif" : "Nonaktif"}</td>
              <td className="px-4 py-2 text-right space-x-3">
                <a href={`/master-data/banks?edit=${b.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleBankActive} className="inline">
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="active" value={String(b.active)} />
                  <button type="submit" className="text-gray-500 underline">
                    {b.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!banks?.length && (
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
