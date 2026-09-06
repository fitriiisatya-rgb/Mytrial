import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { Pagination } from "@/components/master-data/pagination";
import { SearchFilterBar } from "@/components/master-data/search-filter-bar";
import { StatusBadge } from "@/components/master-data/status-badge";
import { inputClass } from "@/components/master-data/form-field";
import { findSimilarRows } from "@/lib/mapping/similar";
import { toSen } from "@/lib/money";
import { resolveException, ignoreException, bulkResolveExceptions } from "../actions";
import type { Database } from "@/types/database.types";

const PAGE_SIZE = 25;
const BASE = "/mapping/exceptions";

const TYPE_LABELS: Record<string, string> = {
  outlet_not_detected: "Outlet tidak terdeteksi",
  coa_not_detected: "COA tidak terdeteksi",
  unknown_classification: "Klasifikasi belum dikonfigurasi",
  ambiguous_mapping: "Ambiguous mapping",
  interbank_transfer: "Interbank/interunit candidate",
  shared_cost_candidate: "Shared cost candidate",
  bank_not_found: "Bank tidak dikenali (Phase 3)",
  invalid_amount: "Nominal tidak valid (Phase 3)",
  malformed_data: "Data tidak sesuai format (Phase 3)",
  duplicate_suspected: "Diduga duplikat (Phase 3)",
};

const TYPE_VARIANT: Record<string, "danger" | "warning" | "neutral"> = {
  interbank_transfer: "warning",
  shared_cost_candidate: "warning",
  ambiguous_mapping: "danger",
  outlet_not_detected: "danger",
  coa_not_detected: "danger",
  unknown_classification: "neutral",
};

export default async function ExceptionCenterPage({
  searchParams,
}: {
  searchParams: { error?: string; type?: string; status?: string; page?: string };
}) {
  const { error, type, page: pageParam } = searchParams;
  const status = searchParams.status ?? "open";
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("exceptions")
    .select("*", { count: "exact" })
    .eq("source_table", "bank_transactions_raw")
    .order("created_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status as Database["public"]["Enums"]["exception_status"]);
  if (type) query = query.eq("exception_type", type as Database["public"]["Enums"]["exception_type"]);

  const from = (page - 1) * PAGE_SIZE;
  const { data: exceptions, count } = await query.range(from, from + PAGE_SIZE - 1);

  const sourceIds = (exceptions ?? []).map((e) => e.source_id);
  const [{ data: sourceRows }, { data: outlets }, { data: coa }] = await Promise.all([
    sourceIds.length
      ? supabase
          .from("bank_transactions_raw")
          .select("id, bank_id, bank_label_raw, txn_date, unit_raw, classification_raw, description_raw, debit, credit")
          .in("id", sourceIds)
      : Promise.resolve({ data: [] }),
    supabase.from("outlets").select("id, outlet_name").eq("active", true).order("outlet_name"),
    supabase.from("coa").select("id, code, name").eq("active", true).order("code"),
  ]);
  const sourceById = new Map((sourceRows ?? []).map((r) => [r.id, r]));

  // Similar Transaction Suggestion (spec item 7): for each exception on
  // this page, which OTHER exceptions on this page look like the same
  // recurring transaction type — surfaced so a human can bulk-resolve
  // them together instead of one at a time.
  const mappableById = new Map(
    (sourceRows ?? []).map((r) => [
      r.id,
      {
        bankId: r.bank_id,
        unitRaw: r.unit_raw,
        classificationRaw: r.classification_raw,
        descriptionRaw: r.description_raw,
        debitSen: toSen(r.debit),
        creditSen: toSen(r.credit),
        detectedOutletId: null,
      },
    ])
  );
  const candidates = (exceptions ?? [])
    .filter((e) => mappableById.has(e.source_id))
    .map((e) => ({ id: e.id, row: mappableById.get(e.source_id)! }));
  const similarByExceptionId = new Map(
    (exceptions ?? [])
      .filter((e) => mappableById.has(e.source_id))
      .map((e) => [
        e.id,
        findSimilarRows(
          mappableById.get(e.source_id)!,
          candidates.filter((c) => c.id !== e.id)
        ),
      ])
  );

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader
        title="Exception Center"
        description="Setiap baris pengeluaran yang tidak bisa dipetakan otomatis (outlet/COA tidak terdeteksi, ambiguous, kandidat transfer antar rekening, atau kandidat biaya bersama) berhenti di sini untuk ditinjau manusia — tidak pernah dijurnal otomatis."
      />

      <SearchFilterBar
        basePath={BASE}
        searchQuery={undefined}
        searchPlaceholder=""
        filters={[
          {
            name: "type",
            label: "Semua Jenis",
            defaultValue: type,
            options: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            name: "status",
            label: "Status",
            defaultValue: status,
            options: [
              { value: "open", label: "Open" },
              { value: "resolved", label: "Resolved" },
              { value: "ignored", label: "Ignored" },
              { value: "all", label: "Semua" },
            ],
          },
        ]}
      />

      <form id="bulk-resolve-form" action={bulkResolveExceptions} className="bg-white border border-border rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="text-xs text-gray-500 w-full">
          Centang beberapa baris di tabel di bawah (kolom paling kiri), lalu pilih resolusi yang sama untuk semuanya sekaligus.
        </div>
        <select name="resolved_outlet_id" className={inputClass} defaultValue="">
          <option value="">— Set Outlet (bulk) —</option>
          {outlets?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.outlet_name}
            </option>
          ))}
        </select>
        <select name="resolved_coa_id" className={inputClass} defaultValue="">
          <option value="">— Set COA (bulk) —</option>
          {coa?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="create_rule_on_resolve" />
          Buat rule dari resolusi ini
        </label>
        <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
          Selesaikan yang Dipilih
        </button>
      </form>

      <DataTable
        emptyMessage="Tidak ada exception untuk filter ini."
        columns={[
          {
            header: "",
            cell: (e) => (status === "open" ? <input type="checkbox" name="ids" value={e.id} form="bulk-resolve-form" /> : null),
          },
          { header: "Jenis", cell: (e) => <StatusBadge label={TYPE_LABELS[e.exception_type] ?? e.exception_type} variant={TYPE_VARIANT[e.exception_type] ?? "neutral"} /> },
          {
            header: "Transaksi",
            cell: (e) => {
              const src = sourceById.get(e.source_id);
              if (!src) return "(baris sumber tidak ditemukan)";
              return (
                <div className="text-xs">
                  <div className="font-medium">{src.bank_label_raw}</div>
                  <div className="text-gray-500">
                    {src.txn_date} · {src.classification_raw ?? "(tanpa klasifikasi)"} · Rp {src.credit}
                  </div>
                  <div className="text-gray-400">{src.description_raw}</div>
                </div>
              );
            },
          },
          { header: "Catatan", cell: (e) => <span className="text-xs text-gray-500">{e.resolution_note ?? "—"}</span> },
          {
            header: "Serupa",
            cell: (e) => {
              const similar = similarByExceptionId.get(e.id) ?? [];
              if (similar.length === 0) return <span className="text-xs text-gray-400">—</span>;
              return <span className="text-xs text-amber-700">{similar.length} baris lain kemungkinan sama — centang &amp; bulk-resolve bersama.</span>;
            },
          },
          {
            header: "Resolusi",
            cell: (e) => {
              if (e.status !== "open") {
                return <span className="text-xs text-gray-500">{e.status === "resolved" ? "Resolved" : "Ignored"}</span>;
              }
              return (
                <div className="space-y-1">
                  <form action={resolveException} className="flex flex-wrap gap-1 items-center">
                    <input type="hidden" name="id" value={e.id} />
                    <select name="resolved_outlet_id" defaultValue={e.suggested_outlet_id ?? ""} className="border border-border rounded px-2 py-1 text-xs">
                      <option value="">Outlet…</option>
                      {outlets?.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.outlet_name}
                        </option>
                      ))}
                    </select>
                    <select name="resolved_coa_id" defaultValue={e.suggested_coa_id ?? ""} className="border border-border rounded px-2 py-1 text-xs">
                      <option value="">COA…</option>
                      {coa?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      <input type="checkbox" name="create_rule_on_resolve" /> rule
                    </label>
                    <button type="submit" className="text-navy underline text-xs">
                      Selesaikan
                    </button>
                  </form>
                  <form action={ignoreException}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="text-gray-400 underline text-xs">
                      Abaikan
                    </button>
                  </form>
                </div>
              );
            },
          },
        ]}
        rows={exceptions ?? []}
      />

      <Pagination basePath={BASE} searchParams={{ type, status }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
