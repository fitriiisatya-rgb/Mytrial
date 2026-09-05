import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { saveCategory, toggleCategoryActive } from "./actions";

export default async function CategoriesSettingsPage({ searchParams }: { searchParams: { error?: string; edit?: string } }) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  const { error, edit } = searchParams;

  const { data: categories } = await supabase.from("cashflow_categories").select("*").order("type").order("display_order");
  const editing = edit ? categories?.find((c) => c.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <h2 className="text-lg font-semibold text-navy mb-1">Kategori Cashflow</h2>
      <p className="text-xs text-gray-500 mb-4">
        Kategori sederhana untuk menandai tujuan penerimaan/pengeluaran — bukan Chart of Accounts.
      </p>

      {canWrite && (
        <form action={saveCategory} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kode</label>
            <input name="code" defaultValue={editing?.code} required className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama</label>
            <input name="name" defaultValue={editing?.name} required className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipe</label>
            <select name="type" defaultValue={editing?.type ?? "CASH_OUT"} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
              <option value="CASH_IN">Penerimaan</option>
              <option value="CASH_OUT">Pengeluaran</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} />
              Aktif
            </label>
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              {editing ? "Simpan" : "Tambah"}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(["CASH_IN", "CASH_OUT"] as const).map((type) => (
          <div key={type}>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">{type === "CASH_IN" ? "Penerimaan" : "Pengeluaran"}</h3>
            <div className="bg-white border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {categories?.filter((c) => c.type === type).map((c) => (
                    <tr key={c.id} className="border-t border-border first:border-t-0">
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">{c.code}</td>
                      <td className="px-4 py-2">{c.name}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{c.is_internal_transfer ? "Transfer Internal" : ""}</td>
                      <td className="px-4 py-2">{c.is_active ? "Aktif" : "Nonaktif"}</td>
                      {canWrite && (
                        <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                          <a href={`/cashflow/settings/categories?edit=${c.id}`} className="text-navy underline">
                            Edit
                          </a>
                          <form action={toggleCategoryActive} className="inline">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="active" value={String(c.is_active)} />
                            <button type="submit" className="text-gray-500 underline">
                              {c.is_active ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
