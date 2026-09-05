import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { Pagination } from "@/components/master-data/pagination";
import { SearchFilterBar } from "@/components/master-data/search-filter-bar";
import { ActiveBadge } from "@/components/master-data/status-badge";
import { ConfirmSubmitButton } from "@/components/master-data/confirm-submit-button";
import { FormField, inputClass } from "@/components/master-data/form-field";
import { canWrite, getCurrentRole } from "@/lib/supabase/permissions";
import { saveContract, toggleContractActive } from "./actions";

const PAGE_SIZE = 20;
const BASE = "/master-data/contracts";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string; q?: string; page?: string; outlet?: string; status?: string };
}) {
  const { error, edit, q, page: pageParam, outlet, status } = searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("partnership_contracts")
    .select("*, outlets(outlet_code, outlet_name)", { count: "exact" })
    .order("contract_number");
  if (q) query = query.ilike("contract_number", `%${q}%`);
  if (outlet) query = query.eq("outlet_id", outlet);
  if (status) query = query.eq("active", status === "active");
  const from = (page - 1) * PAGE_SIZE;
  const { data: contracts, count } = await query.range(from, from + PAGE_SIZE - 1);

  const { data: outlets } = await supabase.from("outlets").select("id, outlet_code, outlet_name").eq("active", true).order("outlet_code");
  const editing = edit ? contracts?.find((c) => c.id === edit) : null;
  const role = await getCurrentRole(supabase);
  const canEdit = canWrite(role, "partnership_contracts");

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader title="Kontrak Kemitraan" />

      {canEdit ? (
        <form action={saveContract} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <FormField label="Outlet" required>
            <select name="outlet_id" defaultValue={editing?.outlet_id} required className={inputClass}>
              <option value="">Pilih outlet…</option>
              {outlets?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.outlet_code} — {o.outlet_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="No. Kontrak" required>
            <input name="contract_number" defaultValue={editing?.contract_number} required className={inputClass} />
          </FormField>
          <FormField label="Durasi (bulan)">
            <input type="number" name="duration_months" defaultValue={editing?.duration_months ?? ""} className={inputClass} />
          </FormField>
          <FormField label="Mulai" required>
            <input type="date" name="start_date" defaultValue={editing?.start_date} required className={inputClass} />
          </FormField>
          <FormField label="Berakhir" required>
            <input type="date" name="end_date" defaultValue={editing?.end_date} required className={inputClass} />
          </FormField>
          <FormField label="Total Investasi (Rp)">
            <input type="number" step="0.01" name="total_investment" defaultValue={editing?.total_investment ?? "0"} className={inputClass} />
          </FormField>
          <FormField label="% Bagi Hasil ke Investor" required>
            <input
              type="number"
              step="0.001"
              min="0"
              max="100"
              name="profit_distribution_pct"
              defaultValue={editing?.profit_distribution_pct}
              required
              className={inputClass}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
            Aktif
          </label>
          <div className="col-span-3">
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              {editing ? "Simpan" : "Tambah"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-gray-400 mb-4">
          Peran Anda tidak memiliki izin mengelola kontrak kemitraan — hanya dapat melihat daftar di bawah.
        </p>
      )}

      <SearchFilterBar
        basePath={BASE}
        searchQuery={q}
        searchPlaceholder="Cari no. kontrak…"
        filters={[
          {
            name: "outlet",
            label: "Semua Outlet",
            defaultValue: outlet,
            options: (outlets ?? []).map((o) => ({ value: o.id, label: `${o.outlet_code} — ${o.outlet_name}` })),
          },
          {
            name: "status",
            label: "Semua Status",
            defaultValue: status,
            options: [
              { value: "active", label: "Aktif" },
              { value: "inactive", label: "Nonaktif" },
            ],
          },
        ]}
      />

      <DataTable
        columns={[
          {
            header: "No. Kontrak",
            cell: (c) => (
              <Link href={`${BASE}/${c.id}`} className="text-navy underline font-medium">
                {c.contract_number}
              </Link>
            ),
          },
          { header: "Outlet", cell: (c) => `${c.outlets?.outlet_code} — ${c.outlets?.outlet_name}` },
          { header: "Periode", cell: (c) => `${c.start_date} → ${c.end_date}` },
          { header: "% Investor / % Ditahan", cell: (c) => `${c.profit_distribution_pct}% / ${c.retained_profit_pct}%` },
          { header: "Status", cell: (c) => <ActiveBadge active={c.active} /> },
          {
            header: "",
            align: "right",
            cell: (c) =>
              canEdit ? (
                <div className="space-x-3">
                  <a href={`${BASE}?edit=${c.id}`} className="text-navy underline">
                    Edit
                  </a>
                  <form action={toggleContractActive} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="active" value={String(c.active)} />
                    <ConfirmSubmitButton
                      confirmMessage={
                        c.active
                          ? `Nonaktifkan kontrak "${c.contract_number}"?`
                          : `Aktifkan kembali kontrak "${c.contract_number}"?`
                      }
                      className="text-gray-500 underline"
                    >
                      {c.active ? "Nonaktifkan" : "Aktifkan"}
                    </ConfirmSubmitButton>
                  </form>
                </div>
              ) : null,
          },
        ]}
        rows={contracts ?? []}
      />
      <Pagination basePath={BASE} searchParams={{ q, outlet, status }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
