import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { getTransactionsPage } from "@/lib/cashflow/queries";
import { PageHeader } from "@/components/cashflow/page-header";
import { TransactionsTable, type TransactionRow } from "@/components/cashflow/transactions-table";
import { TransactionFilterBar, Pagination } from "@/components/cashflow/transaction-filters";

const PAGE_SIZE = 50;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; account?: string; category?: string; type?: string; q?: string; page?: string };
}) {
  const supabase = await createClient();
  await requireCashflowAccess(supabase);

  const page = Math.max(1, Number(searchParams.page) || 1);
  const filters = {
    bankAccountId: searchParams.account || undefined,
    dateFrom: searchParams.from || undefined,
    dateTo: searchParams.to || undefined,
    categoryId: searchParams.category || undefined,
    transactionType: searchParams.type || undefined,
    keyword: searchParams.q || undefined,
  };

  const [{ rows, total }, { data: accounts }, { data: categories }] = await Promise.all([
    getTransactionsPage(supabase, filters, page, PAGE_SIZE),
    supabase.from("bank_accounts").select("id, account_name").order("display_order"),
    supabase.from("cashflow_categories").select("id, name").eq("is_active", true).order("display_order"),
  ]);

  return (
    <div>
      <PageHeader
        title="Transaksi"
        description="Seluruh transaksi cashflow, di semua rekening."
        actions={
          <a
            href={`/api/cashflow/transactions/export?${new URLSearchParams(searchParams as Record<string, string>).toString()}`}
            className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Export CSV
          </a>
        }
      />
      <div className="p-8">
        <TransactionFilterBar
          action="/cashflow/transactions"
          accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.account_name }))}
          categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
          values={{
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            bankAccountId: filters.bankAccountId,
            categoryId: filters.categoryId,
            transactionType: filters.transactionType,
            keyword: filters.keyword,
          }}
        />
        <TransactionsTable rows={rows as unknown as TransactionRow[]} />
        <Pagination baseHref="/cashflow/transactions" page={page} pageSize={PAGE_SIZE} total={total} />
      </div>
    </div>
  );
}
