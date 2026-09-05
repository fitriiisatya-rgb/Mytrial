import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/cashflow/page-header";
import { Badge } from "@/components/cashflow/badge";
import { formatRupiah, formatDateID } from "@/lib/cashflow/format";
import { createPlan, updatePlanStatus, deletePlan } from "./actions";
import { PLANNED_STATUS_LABELS } from "@/lib/cashflow/labels";

const STATUS_TONE: Record<string, "neutral" | "positive" | "negative" | "warning" | "info"> = {
  PLANNED: "neutral",
  APPROVED: "info",
  PAID: "positive",
  RECEIVED: "positive",
  CANCELLED: "negative",
};

const NEXT_STATUS: Record<string, { label: string; status: string }[]> = {
  PLANNED: [{ label: "Setujui", status: "APPROVED" }, { label: "Batalkan", status: "CANCELLED" }],
  APPROVED: [{ label: "Batalkan", status: "CANCELLED" }],
};

export default async function CashflowPlanPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);

  const [{ data: plans }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from("planned_cashflows")
      .select("*, bank_accounts(account_name), cashflow_categories(name)")
      .order("plan_date")
      .limit(200),
    supabase.from("bank_accounts").select("id, account_name").eq("is_active", true).order("display_order"),
    supabase.from("cashflow_categories").select("id, name, type").eq("is_active", true).order("display_order"),
  ]);

  return (
    <div>
      <PageHeader title="Rencana Cashflow" description="Rencana penerimaan/pengeluaran ke depan — dasar untuk proyeksi saldo." />
      <div className="p-8">
        <ErrorBanner message={searchParams.error} />

        {canWrite && (
          <form action={createPlan} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tanggal</label>
              <input type="date" name="plan_date" required className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Rekening</label>
              <select name="bank_account_id" required className="w-full border border-border rounded-lg px-2 py-1.5 text-sm">
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipe</label>
              <select name="type" required className="w-full border border-border rounded-lg px-2 py-1.5 text-sm">
                <option value="CASH_IN">Penerimaan</option>
                <option value="CASH_OUT">Pengeluaran</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kategori</label>
              <select name="category_id" className="w-full border border-border rounded-lg px-2 py-1.5 text-sm">
                <option value="">-</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Jumlah</label>
              <input type="number" step="0.01" name="amount" required className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Deskripsi</label>
              <input name="description" className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-3 md:col-span-6">
              <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
                Tambah Rencana
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Tanggal</th>
                <th className="px-4 py-2">Rekening</th>
                <th className="px-4 py-2">Tipe</th>
                <th className="px-4 py-2">Kategori</th>
                <th className="px-4 py-2">Deskripsi</th>
                <th className="px-4 py-2 text-right">Jumlah</th>
                <th className="px-4 py-2">Status</th>
                {canWrite && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {plans?.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateID(p.plan_date)}</td>
                  <td className="px-4 py-2">{p.bank_accounts?.account_name}</td>
                  <td className="px-4 py-2">{p.type === "CASH_IN" ? "Penerimaan" : "Pengeluaran"}</td>
                  <td className="px-4 py-2 text-gray-500">{p.cashflow_categories?.name ?? "-"}</td>
                  <td className="px-4 py-2">{p.description ?? "-"}</td>
                  <td className={`px-4 py-2 text-right font-medium ${p.type === "CASH_IN" ? "text-emerald-600" : "text-red-600"}`}>
                    {formatRupiah(p.amount)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{PLANNED_STATUS_LABELS[p.status] ?? p.status}</Badge>
                  </td>
                  {canWrite && (
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      {(NEXT_STATUS[p.status] ?? []).map((n) => (
                        <form action={updatePlanStatus} className="inline" key={n.status}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="status" value={n.status} />
                          <button type="submit" className="text-navy underline text-xs">
                            {n.label}
                          </button>
                        </form>
                      ))}
                      {p.status === "PLANNED" && (
                        <form action={deletePlan} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="text-gray-400 underline text-xs">
                            Hapus
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!plans?.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Belum ada cashflow plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
