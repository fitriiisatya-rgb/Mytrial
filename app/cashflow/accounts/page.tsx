import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { getAccountBalances } from "@/lib/cashflow/queries";
import { formatRupiah, todayJakarta, startOfMonthISO, endOfMonthISO } from "@/lib/cashflow/format";
import { PageHeader } from "@/components/cashflow/page-header";

export default async function AccountsPage() {
  const supabase = await createClient();
  await requireCashflowAccess(supabase);

  const today = todayJakarta();
  const accounts = await getAccountBalances(supabase, { from: startOfMonthISO(today), to: endOfMonthISO(today) });
  const totalCash = accounts.reduce((s, a) => s + a.currentBalance, 0);

  return (
    <div>
      <PageHeader
        title="Rekening"
        description="Saldo per rekening — setiap rekening berdiri sendiri, tidak digabung."
        actions={
          <Link href="/cashflow/settings/accounts" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
            Kelola Rekening
          </Link>
        }
      />
      <div className="p-8">
        <div className="mb-4 text-sm text-gray-500">
          Total Saldo Konsolidasi: <span className="font-semibold text-navy">{formatRupiah(totalCash)}</span>
        </div>
        <div className="bg-white border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-surface text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Rekening</th>
                <th className="px-4 py-2">Bank</th>
                <th className="px-4 py-2 text-right">Saldo</th>
                <th className="px-4 py-2 text-right">Penerimaan (bulan ini)</th>
                <th className="px-4 py-2 text-right">Pengeluaran (bulan ini)</th>
                <th className="px-4 py-2 text-right">Proyeksi 30 hari</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.bankAccountId} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-navy">{a.accountName}</td>
                  <td className="px-4 py-3 text-gray-500">{a.bankName}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatRupiah(a.currentBalance)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{formatRupiah(a.cashInPeriod)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatRupiah(a.cashOutPeriod)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatRupiah(a.projectedBalance)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/cashflow/accounts/${a.bankAccountId}`} className="text-navy underline">
                      Detail →
                    </Link>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Belum ada rekening aktif.
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
