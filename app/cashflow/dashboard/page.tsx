import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { getConsolidatedSummary, getAccountBalances, getCashPositionSeries } from "@/lib/cashflow/queries";
import { formatRupiah, todayJakarta, addDaysISO, startOfMonthISO, endOfMonthISO } from "@/lib/cashflow/format";
import { KpiCard } from "@/components/cashflow/kpi-card";
import { PageHeader } from "@/components/cashflow/page-header";
import { Badge } from "@/components/cashflow/badge";
import { CashPositionChart } from "@/components/cashflow/cash-position-chart";
import { ALERT_TYPE_LABELS } from "@/lib/cashflow/labels";

const RANGE_OPTIONS = [
  { key: "today", label: "Hari Ini" },
  { key: "week", label: "Minggu Ini" },
  { key: "month", label: "Bulan Ini" },
] as const;

function resolveRange(key: string | undefined, from?: string, to?: string) {
  const today = todayJakarta();
  if (from && to) return { from, to };
  if (key === "week") return { from: addDaysISO(today, -6), to: today };
  if (key === "month") return { from: startOfMonthISO(today), to: endOfMonthISO(today) };
  return { from: today, to: today };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const supabase = await createClient();
  await requireCashflowAccess(supabase);

  const range = resolveRange(searchParams.range, searchParams.from, searchParams.to);
  const chartRange = { from: addDaysISO(todayJakarta(), -29), to: todayJakarta() };

  const [summary, accounts, series, alertsRes] = await Promise.all([
    getConsolidatedSummary(supabase, range),
    getAccountBalances(supabase, range),
    getCashPositionSeries(supabase, chartRange),
    supabase.from("cashflow_alerts").select("*").eq("status", "OPEN").order("created_at", { ascending: false }).limit(5),
  ]);

  const activeRangeKey = searchParams.from ? undefined : (searchParams.range ?? "today");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Ringkasan konsolidasi seluruh rekening — bukan laporan akuntansi."
        actions={
          <div className="flex gap-1 text-sm">
            {RANGE_OPTIONS.map((opt) => (
              <Link
                key={opt.key}
                href={`/cashflow/dashboard?range=${opt.key}`}
                className={`px-3 py-1.5 rounded-md border ${
                  activeRangeKey === opt.key ? "bg-navy text-white border-navy" : "border-border text-gray-600 hover:bg-surface"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Total Saldo" value={formatRupiah(summary.totalCash)} sub="Seluruh rekening aktif" />
          <KpiCard label="Penerimaan" value={formatRupiah(summary.cashIn)} tone="positive" sub="Periode terpilih, di luar transfer" />
          <KpiCard label="Pengeluaran" value={formatRupiah(summary.cashOut)} tone="negative" sub="Periode terpilih, di luar transfer" />
          <KpiCard
            label="Arus Kas Bersih"
            value={formatRupiah(summary.netCashflow)}
            tone={summary.netCashflow >= 0 ? "positive" : "negative"}
          />
          <KpiCard
            label="Proyeksi Saldo (30 hari)"
            value={formatRupiah(summary.projectedCash)}
            tone={summary.projectedCash >= 0 ? "default" : "negative"}
            sub="Saldo saat ini + rencana 30 hari"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase font-semibold">Saldo Awal</div>
            <div className="font-semibold text-navy mt-1 break-words">{formatRupiah(summary.openingCash)}</div>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase font-semibold">Saldo Akhir</div>
            <div className="font-semibold text-navy mt-1 break-words">{formatRupiah(summary.closingCash)}</div>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase font-semibold">Penerimaan Mendatang (30 hari)</div>
            <div className="font-semibold text-emerald-600 mt-1 break-words">{formatRupiah(summary.upcomingCashIn)}</div>
          </div>
          <div className="bg-white border border-border rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase font-semibold">Pengeluaran Mendatang (30 hari)</div>
            <div className="font-semibold text-red-600 mt-1 break-words">{formatRupiah(summary.upcomingCashOut)}</div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-navy">Posisi Kas (30 hari terakhir)</h2>
          </div>
          <CashPositionChart data={series} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-navy">Saldo per Rekening</h2>
            <Link href="/cashflow/accounts" className="text-xs text-navy underline">
              Lihat semua →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accounts.map((a) => (
              <Link
                key={a.bankAccountId}
                href={`/cashflow/accounts/${a.bankAccountId}`}
                className="bg-white border border-border rounded-lg p-4 hover:border-navy transition-colors"
              >
                <div className="text-sm font-semibold text-navy">{a.accountName}</div>
                <div className="text-xs text-gray-400">{a.bankName}</div>
                <div className={`text-lg font-bold mt-2 whitespace-nowrap ${a.currentBalance < 0 ? "text-red-600" : "text-navy"}`}>{formatRupiah(a.currentBalance)}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-2">
                  <span className="text-emerald-600">+{formatRupiah(a.cashInPeriod)}</span>
                  <span className="text-red-600">-{formatRupiah(a.cashOutPeriod)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">Proyeksi 30d: {formatRupiah(a.projectedBalance)}</div>
              </Link>
            ))}
            {accounts.length === 0 && (
              <div className="col-span-3 text-sm text-gray-400 bg-white border border-border rounded-lg p-6 text-center">
                Belum ada rekening. Jalankan Google Sheet Sync di Settings, atau tambah rekening manual.
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-navy mb-3">Peringatan Cashflow</h2>
          <div className="bg-white border border-border rounded-lg divide-y divide-border">
            {(alertsRes.data ?? []).map((a) => (
              <div key={a.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                <Badge tone={a.severity === "CRITICAL" ? "negative" : a.severity === "WARNING" ? "warning" : "info"}>
                  {ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type}
                </Badge>
                <span className="text-gray-700 break-words">{a.message}</span>
              </div>
            ))}
            {(alertsRes.data ?? []).length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">Tidak ada alert terbuka.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
