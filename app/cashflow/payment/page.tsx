import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/cashflow/page-header";
import { Badge } from "@/components/cashflow/badge";
import { formatRupiah, formatDateID } from "@/lib/cashflow/format";
import { createPaymentSchedule, updatePaymentStatus } from "./actions";
import { PAYMENT_STATUS_LABELS } from "@/lib/cashflow/labels";

const STATUS_TONE: Record<string, "neutral" | "positive" | "negative" | "warning" | "info"> = {
  DRAFT: "neutral",
  SCHEDULED: "info",
  APPROVED: "warning",
  PAID: "positive",
  CANCELLED: "negative",
};

const NEXT_STATUS: Record<string, { label: string; status: string }[]> = {
  DRAFT: [{ label: "Jadwalkan", status: "SCHEDULED" }, { label: "Batalkan", status: "CANCELLED" }],
  SCHEDULED: [{ label: "Setujui", status: "APPROVED" }, { label: "Batalkan", status: "CANCELLED" }],
  APPROVED: [{ label: "Tandai Dibayar", status: "PAID" }, { label: "Batalkan", status: "CANCELLED" }],
};

const PRIORITY_TONE: Record<string, "neutral" | "warning" | "negative"> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "negative",
};

const PRIORITY_LABELS: Record<string, string> = { LOW: "Rendah", NORMAL: "Normal", HIGH: "Tinggi", URGENT: "Mendesak" };

export default async function PaymentSchedulePage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);

  const [{ data: payments }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from("payment_schedules")
      .select("*, bank_accounts(account_name), cashflow_categories(name)")
      .order("due_date")
      .limit(200),
    supabase.from("bank_accounts").select("id, account_name").eq("is_active", true).order("display_order"),
    supabase.from("cashflow_categories").select("id, name").eq("type", "CASH_OUT").eq("is_active", true).order("display_order"),
  ]);

  return (
    <div>
      <PageHeader title="Jadwal Pembayaran" description="Jadwal pengeluaran mendatang — masuk sebagai pengeluaran mendatang di dashboard & proyeksi." />
      <div className="p-8">
        <ErrorBanner message={searchParams.error} />

        {canWrite && (
          <form action={createPaymentSchedule} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Jatuh Tempo</label>
              <input type="date" name="due_date" required className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Rekening</label>
              <select name="bank_account_id" className="w-full border border-border rounded-lg px-2 py-1.5 text-sm">
                <option value="">-</option>
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Penerima</label>
              <input name="payee" required className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
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
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Prioritas</label>
              <select name="priority" defaultValue="NORMAL" className="w-full border border-border rounded-lg px-2 py-1.5 text-sm">
                <option value="LOW">Rendah</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Tinggi</option>
                <option value="URGENT">Mendesak</option>
              </select>
            </div>
            <div className="col-span-3 md:col-span-6">
              <input name="description" placeholder="Deskripsi (opsional)" className="w-full border border-border rounded-lg px-2 py-1.5 text-sm mb-2" />
              <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
                Tambah Jadwal
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Jatuh Tempo</th>
                <th className="px-4 py-2">Penerima</th>
                <th className="px-4 py-2">Rekening</th>
                <th className="px-4 py-2">Kategori</th>
                <th className="px-4 py-2 text-right">Jumlah</th>
                <th className="px-4 py-2">Prioritas</th>
                <th className="px-4 py-2">Status</th>
                {canWrite && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {payments?.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateID(p.due_date)}</td>
                  <td className="px-4 py-2 font-medium text-navy">{p.payee}</td>
                  <td className="px-4 py-2 text-gray-500">{p.bank_accounts?.account_name ?? "-"}</td>
                  <td className="px-4 py-2 text-gray-500">{p.cashflow_categories?.name ?? "-"}</td>
                  <td className="px-4 py-2 text-right font-medium text-red-600">{formatRupiah(p.amount)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={PRIORITY_TONE[p.priority] ?? "neutral"}>{PRIORITY_LABELS[p.priority] ?? p.priority}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{PAYMENT_STATUS_LABELS[p.status] ?? p.status}</Badge>
                  </td>
                  {canWrite && (
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      {(NEXT_STATUS[p.status] ?? []).map((n) => (
                        <form action={updatePaymentStatus} className="inline" key={n.status}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="status" value={n.status} />
                          <button type="submit" className="text-navy underline text-xs">
                            {n.label}
                          </button>
                        </form>
                      ))}
                    </td>
                  )}
                </tr>
              ))}
              {!payments?.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Belum ada jadwal pembayaran.
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
