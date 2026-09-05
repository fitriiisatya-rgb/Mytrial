import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { saveCoa, toggleCoaActive } from "./actions";

const ACCOUNT_TYPES = [
  "asset", "liability", "equity", "revenue", "cogs",
  "operating_expense", "other_income", "other_expense",
] as const;
const PNL_CATEGORIES = ["", "revenue", "cogs", "opex", "other_income", "other_expense"] as const;

export default async function CoaPage({ searchParams }: { searchParams: { error?: string; edit?: string } }) {
  const { error, edit } = searchParams;
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("coa").select("*").order("code");
  const editing = edit ? accounts?.find((a) => a.id === edit) : null;
  const byId = new Map((accounts ?? []).map((a) => [a.id, a]));

  return (
    <div>
      <ErrorBanner message={error} />
      <h2 className="text-lg font-semibold text-navy mb-4">Chart of Accounts</h2>

      <form action={saveCoa} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-4 gap-3">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kode</label>
          <input
            name="code"
            defaultValue={editing?.code}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama</label>
          <input
            name="name"
            defaultValue={editing?.name}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Urutan Laporan</label>
          <input
            type="number"
            name="reporting_order"
            defaultValue={editing?.reporting_order ?? 0}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipe Akun</label>
          <select
            name="account_type"
            defaultValue={editing?.account_type}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Saldo Normal</label>
          <select
            name="normal_balance"
            defaultValue={editing?.normal_balance}
            required
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="debit">debit</option>
            <option value="credit">credit</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kategori P&amp;L</label>
          <select
            name="pnl_category"
            defaultValue={editing?.pnl_category ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            {PNL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c || "— (neraca)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Akun Induk</label>
          <select
            name="parent_id"
            defaultValue={editing?.parent_id ?? ""}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— (tidak ada)</option>
            {accounts
              ?.filter((a) => a.id !== editing?.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
          Aktif
        </label>
        <div className="col-span-4">
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
            <th className="px-4 py-2">Tipe</th>
            <th className="px-4 py-2">Saldo Normal</th>
            <th className="px-4 py-2">Induk</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {accounts?.map((a) => (
            <tr key={a.id} className="border-t border-border">
              <td className="px-4 py-2">{a.code}</td>
              <td className="px-4 py-2">{a.name}</td>
              <td className="px-4 py-2">{a.account_type}</td>
              <td className="px-4 py-2">{a.normal_balance}</td>
              <td className="px-4 py-2">{a.parent_id ? byId.get(a.parent_id)?.code : "—"}</td>
              <td className="px-4 py-2">{a.active ? "Aktif" : "Nonaktif"}</td>
              <td className="px-4 py-2 text-right space-x-3">
                <a href={`/master-data/coa?edit=${a.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleCoaActive} className="inline">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={String(a.active)} />
                  <button type="submit" className="text-gray-500 underline">
                    {a.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!accounts?.length && (
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
