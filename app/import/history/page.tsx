import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { Pagination } from "@/components/master-data/pagination";
import { SearchFilterBar } from "@/components/master-data/search-filter-bar";
import { StatusBadge } from "@/components/master-data/status-badge";

const PAGE_SIZE = 20;
const BASE = "/import/history";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success",
  completed_with_errors: "warning",
  processing: "neutral",
  draft: "neutral",
  failed: "danger",
};

export default async function ImportHistoryPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; source?: string; status?: string };
}) {
  const { q, page: pageParam, source, status } = searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("import_batches")
    .select("*, entities(name), profiles(full_name)", { count: "exact" })
    .order("imported_at", { ascending: false });
  if (q) query = query.ilike("source_name", `%${q}%`);
  if (source) query = query.eq("source", source as "csv_upload" | "excel_upload" | "google_sheet");
  if (status) query = query.eq("status", status);
  const from = (page - 1) * PAGE_SIZE;
  const { data: batches, count } = await query.range(from, from + PAGE_SIZE - 1);

  return (
    <div>
      <PageHeader title="Riwayat Import" description="Setiap import dapat ditelusuri kembali ke sumber, batch, dan baris asal." />

      <SearchFilterBar
        basePath={BASE}
        searchQuery={q}
        searchPlaceholder="Cari nama file/sheet…"
        filters={[
          {
            name: "source",
            label: "Semua Sumber",
            defaultValue: source,
            options: [
              { value: "csv_upload", label: "CSV" },
              { value: "excel_upload", label: "Excel" },
              { value: "google_sheet", label: "Google Sheet" },
            ],
          },
          {
            name: "status",
            label: "Semua Status",
            defaultValue: status,
            options: [
              { value: "completed", label: "Completed" },
              { value: "completed_with_errors", label: "Completed with errors" },
              { value: "processing", label: "Processing" },
              { value: "failed", label: "Failed" },
            ],
          },
        ]}
      />

      <DataTable
        emptyMessage="Belum ada riwayat import."
        columns={[
          {
            header: "Waktu",
            cell: (b) => new Date(b.imported_at).toLocaleString("id-ID"),
          },
          { header: "Sumber", cell: (b) => b.source },
          { header: "File/Sheet", cell: (b) => b.source_name ?? b.source_ref ?? "—" },
          { header: "Entitas", cell: (b) => b.entities?.name ?? "—" },
          { header: "Diimpor Oleh", cell: (b) => b.profiles?.full_name ?? "—" },
          { header: "Baris", cell: (b) => b.row_count },
          { header: "Valid", cell: (b) => b.valid_rows },
          { header: "Duplikat", cell: (b) => b.duplicate_count },
          { header: "Error", cell: (b) => b.error_count },
          { header: "Status", cell: (b) => <StatusBadge label={b.status} variant={STATUS_VARIANT[b.status] ?? "neutral"} /> },
          {
            header: "",
            align: "right",
            cell: (b) => (
              <Link href={`${BASE}/${b.id}`} className="text-navy underline">
                Detail
              </Link>
            ),
          },
        ]}
        rows={batches ?? []}
      />
      <Pagination basePath={BASE} searchParams={{ q, source, status }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
