import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashflowTransactionType, Database } from "@/types/database.types";
import { todayJakarta, addDaysISO } from "./format";

type DB = SupabaseClient<Database>;

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Server-side aggregation over a bounded date range, narrow column
 * selection only (never the full row) so the client never receives raw
 * transaction history it doesn't need. For the volumes expected in Phase
 * 1/2 (a handful of accounts, one spreadsheet) this is fast; once history
 * grows into the tens of thousands of rows per account, replace with a
 * dedicated Postgres aggregate RPC (same shape, same call sites).
 */
async function sumTransactionsInRange(supabase: DB, range: DateRange, opts?: { excludeTransfers?: boolean }) {
  let query = supabase
    .from("cashflow_transactions")
    .select("cash_in, cash_out, transaction_type")
    .gte("transaction_date", range.from)
    .lte("transaction_date", range.to);
  if (opts?.excludeTransfers) {
    query = query.in("transaction_type", ["CASH_IN", "CASH_OUT"]);
  }
  const { data } = await query;
  return (data ?? []).reduce(
    (acc, t) => ({ cashIn: acc.cashIn + Number(t.cash_in), cashOut: acc.cashOut + Number(t.cash_out) }),
    { cashIn: 0, cashOut: 0 }
  );
}

export interface ConsolidatedSummary {
  totalCash: number;
  cashIn: number;
  cashOut: number;
  netCashflow: number;
  openingCash: number;
  closingCash: number;
  upcomingCashIn: number;
  upcomingCashOut: number;
  projectedCash: number;
}

export async function getConsolidatedSummary(supabase: DB, range: DateRange): Promise<ConsolidatedSummary> {
  const { data: balances } = await supabase.from("v_bank_account_balance").select("current_balance").eq("is_active", true);
  const totalCash = (balances ?? []).reduce((s, b) => s + Number(b.current_balance), 0);

  // RULE 3: headline Cash In / Cash Out exclude internal transfer legs.
  const external = await sumTransactionsInRange(supabase, range, { excludeTransfers: true });
  const netCashflow = external.cashIn - external.cashOut;

  // Consolidated balance "before" the range — internal transfers net to
  // zero across accounts automatically here, so no need to exclude them.
  const beforeRange = await sumTransactionsInRange(supabase, { from: "1900-01-01", to: addDaysISO(range.from, -1) });
  const { data: openingBalances } = await supabase.from("bank_accounts").select("opening_balance").eq("is_active", true);
  const openingCash =
    (openingBalances ?? []).reduce((s, b) => s + Number(b.opening_balance), 0) + beforeRange.cashIn - beforeRange.cashOut;
  const inRangeAll = await sumTransactionsInRange(supabase, range);
  const closingCash = openingCash + inRangeAll.cashIn - inRangeAll.cashOut;

  const today = todayJakarta();
  const { data: plans } = await supabase
    .from("planned_cashflows")
    .select("type, amount")
    .in("status", ["PLANNED", "APPROVED"])
    .gte("plan_date", today)
    .lte("plan_date", addDaysISO(today, 30));
  const upcomingCashIn = (plans ?? []).filter((p) => p.type === "CASH_IN").reduce((s, p) => s + Number(p.amount), 0);
  const upcomingCashOut = (plans ?? []).filter((p) => p.type === "CASH_OUT").reduce((s, p) => s + Number(p.amount), 0);

  return {
    totalCash,
    cashIn: external.cashIn,
    cashOut: external.cashOut,
    netCashflow,
    openingCash,
    closingCash,
    upcomingCashIn,
    upcomingCashOut,
    projectedCash: totalCash + upcomingCashIn - upcomingCashOut,
  };
}

export interface AccountBalanceRow {
  bankAccountId: string;
  accountCode: string;
  accountName: string;
  bankName: string;
  currentBalance: number;
  cashInPeriod: number;
  cashOutPeriod: number;
  projectedBalance: number;
}

export async function getAccountBalances(supabase: DB, range: DateRange): Promise<AccountBalanceRow[]> {
  const { data: balances } = await supabase
    .from("v_bank_account_balance")
    .select("*")
    .eq("is_active", true)
    .order("display_order");

  const { data: periodTxns } = await supabase
    .from("cashflow_transactions")
    .select("bank_account_id, cash_in, cash_out")
    .gte("transaction_date", range.from)
    .lte("transaction_date", range.to);

  const { data: plans } = await supabase
    .from("planned_cashflows")
    .select("bank_account_id, type, amount")
    .in("status", ["PLANNED", "APPROVED"])
    .gte("plan_date", todayJakarta())
    .lte("plan_date", addDaysISO(todayJakarta(), 30));

  return (balances ?? []).map((b) => {
    const periodForAccount = (periodTxns ?? []).filter((t) => t.bank_account_id === b.bank_account_id);
    const cashInPeriod = periodForAccount.reduce((s, t) => s + Number(t.cash_in), 0);
    const cashOutPeriod = periodForAccount.reduce((s, t) => s + Number(t.cash_out), 0);
    const accountPlans = (plans ?? []).filter((p) => p.bank_account_id === b.bank_account_id);
    const upcomingIn = accountPlans.filter((p) => p.type === "CASH_IN").reduce((s, p) => s + Number(p.amount), 0);
    const upcomingOut = accountPlans.filter((p) => p.type === "CASH_OUT").reduce((s, p) => s + Number(p.amount), 0);

    return {
      bankAccountId: b.bank_account_id,
      accountCode: b.account_code,
      accountName: b.account_name,
      bankName: b.bank_name,
      currentBalance: Number(b.current_balance),
      cashInPeriod,
      cashOutPeriod,
      projectedBalance: Number(b.current_balance) + upcomingIn - upcomingOut,
    };
  });
}

export interface TransactionFilters {
  bankAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  transactionType?: string;
  keyword?: string;
}

export async function getTransactionsPage(
  supabase: DB,
  filters: TransactionFilters,
  page: number,
  pageSize: number
) {
  let query = supabase
    .from("v_cashflow_running_balance")
    .select("*, bank_accounts(account_name, bank_name), cashflow_categories(name)", { count: "exact" })
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.bankAccountId) query = query.eq("bank_account_id", filters.bankAccountId);
  if (filters.dateFrom) query = query.gte("transaction_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("transaction_date", filters.dateTo);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.transactionType) query = query.eq("transaction_type", filters.transactionType as CashflowTransactionType);
  if (filters.keyword) query = query.ilike("description", `%${filters.keyword}%`);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await query.range(from, to);

  return { rows: data ?? [], total: count ?? 0, error };
}

/** Daily consolidated cash position for the chart — actual history + a simple linear projection using upcoming planned_cashflows. */
export async function getCashPositionSeries(supabase: DB, range: DateRange) {
  const { data: snapshots } = await supabase
    .from("account_balance_snapshots")
    .select("snapshot_date, closing_balance, bank_account_id, bank_accounts!inner(is_active)")
    .gte("snapshot_date", range.from)
    .lte("snapshot_date", range.to)
    .eq("bank_accounts.is_active", true);

  const byDate = new Map<string, number>();
  for (const s of snapshots ?? []) {
    byDate.set(s.snapshot_date, (byDate.get(s.snapshot_date) ?? 0) + Number(s.closing_balance));
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, balance]) => ({ date, actual: balance, projected: null as number | null }));
}
