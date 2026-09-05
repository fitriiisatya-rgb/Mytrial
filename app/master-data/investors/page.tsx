import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { saveInvestor, toggleInvestorStatus } from "./actions";

export default async function InvestorsPage({ searchParams }: { searchParams: { error?: string; edit?: string } }) {
  const { error, edit } = searchParams;
  const supabase = await createClient();
  const { data: investors } = await supabase.from("investors").select("*").order("investor_code");
  const editing = edit ? investors?.find((i) => i.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <h2 className="text-lg font-semibold text-navy mb-4">Investor</h2>

      <form
        action={saveInvestor}
        className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3"
      >
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kode Investor</label>
          <input
            name="investor_code"
            defaultValue={editing?.investor_code}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama Lengkap</label>
          <input
            name="full_name"
            defaultValue={editing?.full_name}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
          <input
            type="email"
            name="email"
            defaultValue={editing?.email ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Telepon</label>
          <input
            name="phone"
            defaultValue={editing?.phone ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
          <select
            name="status"
            defaultValue={editing?.status ?? "active"}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
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
            <th className="px-4 py-2">Kode</th>
            <th className="px-4 py-2">Nama</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Telepon</th>
            <th className="px-4 py-2">Akun Login</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {investors?.map((i) => (
            <tr key={i.id} className="border-t border-border">
              <td className="px-4 py-2">{i.investor_code}</td>
              <td className="px-4 py-2">{i.full_name}</td>
              <td className="px-4 py-2">{i.email ?? "—"}</td>
              <td className="px-4 py-2">{i.phone ?? "—"}</td>
              <td className="px-4 py-2">{i.profile_id ? "Terhubung" : "Belum ada (Phase 3)"}</td>
              <td className="px-4 py-2">{i.status}</td>
              <td className="px-4 py-2 text-right space-x-3">
                <a href={`/master-data/investors?edit=${i.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleInvestorStatus} className="inline">
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="status" value={i.status} />
                  <button type="submit" className="text-gray-500 underline">
                    {i.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!investors?.length && (
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
