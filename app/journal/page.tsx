import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { Pagination } from "@/components/master-data/pagination";
import { SearchFilterBar } from "@/components/master-data/search-filter-bar";
import { StatusBadge } from "@/components/master-data/status-badge";
import { inputClass } from "@/components/master-data/form-field";
import { generateDraftJournals, bulkWorkflowAction } from "./actions";
import { fromSen, toSen } from "@/lib/money";

const PAGE_SIZE = 25;
const BASE = "/journal";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  draft: "neutral",
  reviewed: "warning",
  approved: "warning",
  posted: "success",
  reversed: "danger",
};

const SOURCE_LABELS: Record<string, string> = {
  bank_expense: "Pengeluaran Bank",
  revenue: "Penerimaan",
  manual: "Manual",
  allocation: "Shared Cost",
  interbank_transfer: "Transfer Antar Bank",
  opening_balance: "Saldo Awal",
};

export default async function AutoJournalPage({
  searchParams,
}: {
  searchParams: { error?: string; generated?: string; bulk_ok?: string; status?: string; source_type?: string; entity_id?: string; page?: string };
}) {
  const { error, generated, bulk_ok, source_type, entity_id, page: pageParam } = searchParams;
  const status = searchParams.status ?? "draft";
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("journal_headers")
    .select("*, entities(name), journal_lines(debit, credit, outlet_id, outlets(outlet_name))", { count: "exact" })
    .order("journal_date", { ascending: false });
  if (status !== "all") query = query.eq("status", status as "draft" | "reviewed" | "approved" | "posted" | "reversed");
  if (source_type) query = query.eq("source_type", source_type as never);
  if (entity_id) query = query.eq("entity_id", entity_id);

  const from = (page - 1) * PAGE_SIZE;
  const { data: journals, count } = await query.range(from, from + PAGE_SIZE - 1);

  const { data: entities } = await supabase.from("entities").select("id, name").eq("active", true).order("name");

  const rows = (journals ?? []).map((j) => {
    const totalDebit = j.journal_lines.reduce((s, l) => s + toSen(l.debit), 0n);
    const totalCredit = j.journal_lines.reduce((s, l) => s + toSen(l.credit), 0n);
    const outletNames = [...new Set(j.journal_lines.map((l) => l.outlets?.outlet_name).filter(Boolean))];
    return {
      ...j,
      totalDebitSen: totalDebit,
      totalCreditSen: totalCredit,
      balanced: totalDebit === totalCredit,
      outletLabel: outletNames.length === 0 ? "—" : outletNames.length === 1 ? outletNames[0]! : `${outletNames.length} outlet`,
    };
  });

  return (
    <div>
      <ErrorBanner message={error} />
      {generated !== undefined && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {generated} draft jurnal berhasil dibuat.
        </div>
      )}
      {bulk_ok !== undefined && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {bulk_ok} jurnal berhasil diproses.
        </div>
      )}
      <PageHeader
        title="Auto Journal"
        description="Jurnal dibuat otomatis dari transaksi yang sudah mapped (Phase 4). Hanya jurnal berstatus Posted yang masuk General Ledger dan P&L."
        action={
          <form action={generateDraftJournals} className="flex gap-2 items-center">
            <select name="entity_id" className={inputClass} required defaultValue="">
              <option value="">Pilih entitas…</option>
              {entities?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap">
              Generate Draft
            </button>
          </form>
        }
      />

      <SearchFilterBar
        basePath={BASE}
        searchQuery={undefined}
        searchPlaceholder=""
        filters={[
          {
            name: "status",
            label: "Status",
            defaultValue: status,
            options: [
              { value: "draft", label: "Draft" },
              { value: "reviewed", label: "Reviewed" },
              { value: "approved", label: "Approved" },
              { value: "posted", label: "Posted" },
              { value: "reversed", label: "Reversed" },
              { value: "all", label: "Semua" },
            ],
          },
          {
            name: "source_type",
            label: "Semua Sumber",
            defaultValue: source_type,
            options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            name: "entity_id",
            label: "Semua Entitas",
            defaultValue: entity_id,
            options: (entities ?? []).map((e) => ({ value: e.id, label: e.name })),
          },
        ]}
      />

      <form id="bulk-journal-form" action={bulkWorkflowAction} className="bg-white border border-border rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-center">
        <span className="text-xs text-gray-500">Centang beberapa jurnal, lalu:</span>
        <button type="submit" name="action" value="review" className="text-navy underline text-sm">
          Bulk Review
        </button>
        <button type="submit" name="action" value="approve" className="text-navy underline text-sm">
          Bulk Approve
        </button>
        <button type="submit" name="action" value="post" className="text-navy underline text-sm">
          Bulk Post
        </button>
      </form>

      <DataTable
        emptyMessage="Tidak ada jurnal untuk filter ini."
        columns={[
          { header: "", cell: (j) => <input type="checkbox" name="ids" value={j.id} form="bulk-journal-form" /> },
          { header: "No. Jurnal", cell: (j) => <Link href={`${BASE}/${j.id}`} className="text-navy underline">{j.journal_number}</Link> },
          { header: "Tanggal", cell: (j) => j.journal_date },
          { header: "Sumber", cell: (j) => SOURCE_LABELS[j.source_type] ?? j.source_type },
          { header: "Entitas", cell: (j) => j.entities?.name ?? "—" },
          { header: "Outlet", cell: (j) => j.outletLabel },
          { header: "Debit", align: "right", cell: (j) => fromSen(j.totalDebitSen) },
          { header: "Kredit", align: "right", cell: (j) => fromSen(j.totalCreditSen) },
          { header: "Status", cell: (j) => <StatusBadge label={j.status} variant={STATUS_VARIANT[j.status] ?? "neutral"} /> },
          {
            header: "Balance",
            cell: (j) => (j.balanced ? <StatusBadge label="Balanced" variant="success" /> : <StatusBadge label="Unbalanced" variant="danger" />),
          },
        ]}
        rows={rows}
      />

      <Pagination basePath={BASE} searchParams={{ status, source_type, entity_id }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
