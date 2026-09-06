import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { getConsolidatedSummary } from "@/lib/cashflow/queries";
import { PageHeader } from "@/components/cashflow/page-header";
import { Badge } from "@/components/cashflow/badge";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { formatRupiah, formatDateID, todayJakarta, startOfMonthISO, endOfMonthISO } from "@/lib/cashflow/format";
import { confirmInternalTransfer, rejectInternalTransfer } from "./actions";

type DB = SupabaseClient<Database>;
type Range = { from: string; to: string };

const TABS = [
  { key: "consolidated", label: "Konsolidasi" },
  { key: "account", label: "Per Rekening" },
  { key: "category", label: "Per Kategori" },
  { key: "transfers", label: "Transfer Internal" },
  { key: "reconciliation", label: "Rekonsiliasi" },
];

async function ConsolidatedReport({ supabase, range }: { supabase: DB; range: Range }) {
  const summary = await getConsolidatedSummary(supabase, range);
  const rows = [
    ["Saldo Awal", summary.openingCash],
    ["Penerimaan", summary.cashIn],
    ["Pengeluaran", summary.cashOut],
    ["Arus Kas Bersih", summary.netCashflow],
    ["Saldo Akhir", summary.closingCash],
  ] as const;
  return (
    <div className="bg-white border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-border first:border-t-0">
              <td className="px-4 py-3 text-gray-500">{label}</td>
              <td className="px-4 py-3 text-right font-semibold text-navy">{formatRupiah(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function AccountReport({ supabase, range }: { supabase: DB; range: Range }) {
  const { data: accounts } = await supabase.from("bank_accounts").select("id, account_name, bank_name").eq("is_active", true).order("display_order");
  const { data: snapshots } = await supabase
    .from("account_balance_snapshots")
    .select("bank_account_id, snapshot_date, opening_balance, cash_in, cash_out, closing_balance")
    .gte("snapshot_date", range.from)
    .lte("snapshot_date", range.to)
    .order("snapshot_date");

  const rows = (accounts ?? []).map((a) => {
    const accSnaps = (snapshots ?? []).filter((s) => s.bank_account_id === a.id);
    const first = accSnaps[0];
    const last = accSnaps.at(-1);
    const opening = first ? Number(first.opening_balance) : 0;
    const closing = last ? Number(last.closing_balance) : opening;
    const cashIn = accSnaps.reduce((s, x) => s + Number(x.cash_in), 0);
    const cashOut = accSnaps.reduce((s, x) => s + Number(x.cash_out), 0);
    return { ...a, opening, cashIn, cashOut, net: cashIn - cashOut, closing };
  });

  return (
    <div className="bg-white border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-surface text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Rekening</th>
            <th className="px-4 py-2 text-right">Saldo Awal</th>
            <th className="px-4 py-2 text-right">Penerimaan</th>
            <th className="px-4 py-2 text-right">Pengeluaran</th>
            <th className="px-4 py-2 text-right">Bersih</th>
            <th className="px-4 py-2 text-right">Saldo Akhir</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-2 font-medium text-navy">{r.account_name}</td>
              <td className="px-4 py-2 text-right">{formatRupiah(r.opening)}</td>
              <td className="px-4 py-2 text-right text-emerald-600">{formatRupiah(r.cashIn)}</td>
              <td className="px-4 py-2 text-right text-red-600">{formatRupiah(r.cashOut)}</td>
              <td className="px-4 py-2 text-right">{formatRupiah(r.net)}</td>
              <td className="px-4 py-2 text-right font-semibold">{formatRupiah(r.closing)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                Tidak ada rekening aktif.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

async function CategoryReport({ supabase, range }: { supabase: DB; range: Range }) {
  const { data: txns } = await supabase
    .from("cashflow_transactions")
    .select("cash_in, cash_out, category_id, cashflow_categories(name, type)")
    .gte("transaction_date", range.from)
    .lte("transaction_date", range.to);

  const byCategory = new Map<string, { name: string; type: string; total: number }>();
  for (const t of txns ?? []) {
    const cat = t.cashflow_categories as unknown as { name: string; type: string } | null;
    const key = cat?.name ?? "Tanpa Kategori";
    const entry = byCategory.get(key) ?? { name: key, type: cat?.type ?? "-", total: 0 };
    entry.total += Number(t.cash_in) + Number(t.cash_out);
    byCategory.set(key, entry);
  }

  const rows = Array.from(byCategory.values()).sort((a, b) => b.total - a.total);
  return (
    <div className="bg-white border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Kategori</th>
            <th className="px-4 py-2">Tipe</th>
            <th className="px-4 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border">
              <td className="px-4 py-2">{r.name}</td>
              <td className="px-4 py-2 text-gray-500">{r.type === "CASH_IN" ? "Penerimaan" : r.type === "CASH_OUT" ? "Pengeluaran" : r.type}</td>
              <td className="px-4 py-2 text-right font-semibold">{formatRupiah(r.total)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                Tidak ada transaksi pada periode ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

async function TransfersReport({ supabase, canWrite }: { supabase: DB; canWrite: boolean }) {
  const { data: transfers } = await supabase
    .from("internal_transfers")
    .select("*, from:from_bank_account_id(account_name), to:to_bank_account_id(account_name)")
    .order("transfer_date", { ascending: false })
    .limit(100);

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Sistem menyarankan pasangan transfer antar rekening berdasarkan jumlah dan tanggal yang cocok. Konfirmasi diperlukan
        sebelum sebuah transaksi dianggap internal transfer (tidak memengaruhi net cashflow eksternal).
      </p>
      <div className="bg-white border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-surface text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Tanggal</th>
              <th className="px-4 py-2">Dari</th>
              <th className="px-4 py-2">Ke</th>
              <th className="px-4 py-2 text-right">Jumlah</th>
              <th className="px-4 py-2">Keyakinan</th>
              <th className="px-4 py-2">Status</th>
              {canWrite && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {(transfers ?? []).map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-2 whitespace-nowrap">{formatDateID(t.transfer_date)}</td>
                <td className="px-4 py-2">{(t.from as unknown as { account_name: string } | null)?.account_name ?? "-"}</td>
                <td className="px-4 py-2">{(t.to as unknown as { account_name: string } | null)?.account_name ?? "-"}</td>
                <td className="px-4 py-2 text-right font-semibold">{formatRupiah(t.amount)}</td>
                <td className="px-4 py-2">
                  <Badge tone={t.match_confidence === "high" ? "positive" : t.match_confidence === "medium" ? "warning" : "neutral"}>
                    {t.match_confidence === "high" ? "Tinggi" : t.match_confidence === "medium" ? "Sedang" : t.match_confidence === "low" ? "Rendah" : "Manual"}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  <Badge tone={t.status === "confirmed" ? "positive" : t.status === "rejected" ? "negative" : "warning"}>
                    {t.status === "confirmed" ? "Dikonfirmasi" : t.status === "rejected" ? "Ditolak" : "Disarankan"}
                  </Badge>
                </td>
                {canWrite && (
                  <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    {t.status === "suggested" && (
                      <>
                        <form action={confirmInternalTransfer} className="inline">
                          <input type="hidden" name="id" value={t.id} />
                          <button type="submit" className="text-navy underline text-xs">
                            Konfirmasi
                          </button>
                        </form>
                        <form action={rejectInternalTransfer} className="inline">
                          <input type="hidden" name="id" value={t.id} />
                          <button type="submit" className="text-gray-400 underline text-xs">
                            Tolak
                          </button>
                        </form>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!transfers?.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Belum ada kandidat transfer internal.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function ReconciliationReport({ supabase }: { supabase: DB }) {
  const { data: diffs } = await supabase
    .from("account_balance_snapshots")
    .select("*, bank_accounts(account_name)")
    .eq("reconciliation_status", "DIFFERENCE")
    .order("snapshot_date", { ascending: false })
    .limit(100);

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Saldo Awal + Penerimaan − Pengeluaran dibandingkan dengan saldo dari spreadsheet (jika tersedia). Selisih ditampilkan apa
        adanya — tidak disembunyikan.
      </p>
      <div className="bg-white border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-surface text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Tanggal</th>
              <th className="px-4 py-2">Rekening</th>
              <th className="px-4 py-2 text-right">Saldo Sistem</th>
              <th className="px-4 py-2 text-right">Saldo Spreadsheet</th>
              <th className="px-4 py-2 text-right">Selisih</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(diffs ?? []).map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-4 py-2 whitespace-nowrap">{formatDateID(d.snapshot_date)}</td>
                <td className="px-4 py-2">{d.bank_accounts?.account_name}</td>
                <td className="px-4 py-2 text-right">{formatRupiah(d.closing_balance)}</td>
                <td className="px-4 py-2 text-right">{formatRupiah(d.source_balance)}</td>
                <td className="px-4 py-2 text-right text-red-600 font-semibold">
                  {formatRupiah(Number(d.source_balance) - Number(d.closing_balance))}
                </td>
                <td className="px-4 py-2">
                  <Badge tone="negative">Selisih</Badge>
                </td>
              </tr>
            ))}
            {!diffs?.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Tidak ada selisih rekonsiliasi. Semua saldo cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { tab?: string; from?: string; to?: string; error?: string };
}) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  const tab = searchParams.tab ?? "consolidated";
  const today = todayJakarta();
  const range = { from: searchParams.from || startOfMonthISO(today), to: searchParams.to || endOfMonthISO(today) };

  return (
    <div>
      <PageHeader title="Reports" description="Laporan cashflow — bukan laporan laba rugi." />
      <nav className="border-b border-border bg-white px-8 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/cashflow/reports?tab=${t.key}&from=${range.from}&to=${range.to}`}
            className={`px-3 py-2 text-sm whitespace-nowrap ${tab === t.key ? "text-navy border-b-2 border-gold font-semibold" : "text-gray-600 hover:text-navy"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="p-8">
        <ErrorBanner message={searchParams.error} />

        {tab !== "transfers" && tab !== "reconciliation" && (
          <form action="/cashflow/reports" method="get" className="bg-white border border-border rounded-lg p-4 mb-6 flex gap-3 items-end">
            <input type="hidden" name="tab" value={tab} />
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Dari</label>
              <input type="date" name="from" defaultValue={range.from} className="border border-border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Sampai</label>
              <input type="date" name="to" defaultValue={range.to} className="border border-border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              Terapkan
            </button>
          </form>
        )}

        {tab === "consolidated" && <ConsolidatedReport supabase={supabase} range={range} />}
        {tab === "account" && <AccountReport supabase={supabase} range={range} />}
        {tab === "category" && <CategoryReport supabase={supabase} range={range} />}
        {tab === "transfers" && <TransfersReport supabase={supabase} canWrite={canWrite} />}
        {tab === "reconciliation" && <ReconciliationReport supabase={supabase} />}
      </div>
    </div>
  );
}
