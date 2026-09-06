import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { getTransactionsPage } from "@/lib/cashflow/queries";
import { formatRupiah, formatDateID, maskAccountNumber, todayJakarta, addDaysISO, startOfMonthISO, endOfMonthISO } from "@/lib/cashflow/format";
import { PageHeader } from "@/components/cashflow/page-header";
import { KpiCard } from "@/components/cashflow/kpi-card";
import { Badge } from "@/components/cashflow/badge";
import { CashPositionChart } from "@/components/cashflow/cash-position-chart";
import { TransactionsTable, type TransactionRow } from "@/components/cashflow/transactions-table";
import { TransactionFilterBar, Pagination } from "@/components/cashflow/transaction-filters";

const PAGE_SIZE = 50;

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string; to?: string; category?: string; type?: string; q?: string; page?: string };
}) {
  const supabase = await createClient();
  await requireCashflowAccess(supabase);

  const { data: account } = await supabase.from("bank_accounts").select("*").eq("id", params.id).maybeSingle();
  if (!account) notFound();

  const { data: balanceRow } = await supabase.from("v_bank_account_balance").select("*").eq("bank_account_id", params.id).maybeSingle();
  const currentBalance = Number(balanceRow?.current_balance ?? account.opening_balance);

  const today = todayJakarta();
  const periodFrom = searchParams.from || startOfMonthISO(today);
  const periodTo = searchParams.to || endOfMonthISO(today);

  const { data: periodSnapshots } = await supabase
    .from("account_balance_snapshots")
    .select("snapshot_date, opening_balance, closing_balance, cash_in, cash_out, reconciliation_status")
    .eq("bank_account_id", params.id)
    .gte("snapshot_date", periodFrom)
    .lte("snapshot_date", periodTo)
    .order("snapshot_date");

  const periodCashIn = (periodSnapshots ?? []).reduce((s, r) => s + Number(r.cash_in), 0);
  const periodCashOut = (periodSnapshots ?? []).reduce((s, r) => s + Number(r.cash_out), 0);
  const firstSnapshot = periodSnapshots?.[0];
  const lastSnapshot = periodSnapshots?.at(-1);
  const periodOpening = firstSnapshot ? Number(firstSnapshot.opening_balance) : currentBalance;
  const periodClosing = lastSnapshot ? Number(lastSnapshot.closing_balance) : currentBalance;
  const hasDifference = (periodSnapshots ?? []).some((r) => r.reconciliation_status === "DIFFERENCE");

  const { data: plans } = await supabase
    .from("planned_cashflows")
    .select("type, amount")
    .eq("bank_account_id", params.id)
    .in("status", ["PLANNED", "APPROVED"])
    .gte("plan_date", today)
    .lte("plan_date", addDaysISO(today, 30));
  const upcomingIn = (plans ?? []).filter((p) => p.type === "CASH_IN").reduce((s, p) => s + Number(p.amount), 0);
  const upcomingOut = (plans ?? []).filter((p) => p.type === "CASH_OUT").reduce((s, p) => s + Number(p.amount), 0);
  const projectedBalance = currentBalance + upcomingIn - upcomingOut;

  const { data: chartSnapshots } = await supabase
    .from("account_balance_snapshots")
    .select("snapshot_date, closing_balance")
    .eq("bank_account_id", params.id)
    .gte("snapshot_date", addDaysISO(today, -29))
    .lte("snapshot_date", today)
    .order("snapshot_date");
  const chartData = (chartSnapshots ?? []).map((s) => ({ date: s.snapshot_date, actual: Number(s.closing_balance), projected: null as number | null }));

  const page = Math.max(1, Number(searchParams.page) || 1);
  const filters = {
    bankAccountId: params.id,
    dateFrom: searchParams.from,
    dateTo: searchParams.to,
    categoryId: searchParams.category,
    transactionType: searchParams.type,
    keyword: searchParams.q,
  };
  const [{ rows, total }, { data: categories }] = await Promise.all([
    getTransactionsPage(supabase, filters, page, PAGE_SIZE),
    supabase.from("cashflow_categories").select("id, name").eq("is_active", true).order("display_order"),
  ]);

  return (
    <div>
      <PageHeader
        title={account.account_name}
        description={`${account.bank_name} · ${maskAccountNumber(account.account_number)}${account.entity_label ? ` · ${account.entity_label}` : ""}`}
        actions={
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase font-semibold">Saldo Saat Ini</div>
            <div className={`text-xl font-bold whitespace-nowrap ${currentBalance < 0 ? "text-red-600" : "text-navy"}`}>{formatRupiah(currentBalance)}</div>
            <div className="text-xs text-gray-400">Proyeksi 30 hari: {formatRupiah(projectedBalance)}</div>
          </div>
        }
      />
      <div className="p-8 space-y-6">
        {hasDifference && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Ditemukan selisih antara saldo kalkulasi sistem dan saldo sumber (spreadsheet) pada periode ini. Lihat Laporan → Rekonsiliasi
            untuk detail.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Saldo Awal" value={formatRupiah(periodOpening)} sub={formatDateID(periodFrom)} />
          <KpiCard label="Penerimaan" value={formatRupiah(periodCashIn)} tone="positive" />
          <KpiCard label="Pengeluaran" value={formatRupiah(periodCashOut)} tone="negative" />
          <KpiCard label="Arus Kas Bersih" value={formatRupiah(periodCashIn - periodCashOut)} tone={periodCashIn - periodCashOut >= 0 ? "positive" : "negative"} />
          <KpiCard label="Saldo Akhir" value={formatRupiah(periodClosing)} sub={formatDateID(periodTo)} />
        </div>

        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-navy">Saldo Harian (30 hari terakhir)</h2>
            {hasDifference && <Badge tone="warning">Rekonsiliasi: Selisih</Badge>}
          </div>
          <CashPositionChart data={chartData} />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-navy mb-3">Transaksi</h2>
          <TransactionFilterBar
            action={`/cashflow/accounts/${params.id}`}
            categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
            values={{ dateFrom: searchParams.from, dateTo: searchParams.to, categoryId: searchParams.category, transactionType: searchParams.type, keyword: searchParams.q }}
            showAccountFilter={false}
          />
          <TransactionsTable rows={rows as unknown as TransactionRow[]} showAccount={false} />
          <Pagination baseHref={`/cashflow/accounts/${params.id}`} page={page} pageSize={PAGE_SIZE} total={total} />
        </div>
      </div>
    </div>
  );
}
