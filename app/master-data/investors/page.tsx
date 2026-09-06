import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { Pagination } from "@/components/master-data/pagination";
import { SearchFilterBar } from "@/components/master-data/search-filter-bar";
import { LoginStatusBadge, StatusBadge } from "@/components/master-data/status-badge";
import { ConfirmSubmitButton } from "@/components/master-data/confirm-submit-button";
import { FormField, inputClass } from "@/components/master-data/form-field";
import { saveInvestor, toggleInvestorStatus } from "./actions";

const PAGE_SIZE = 20;
const BASE = "/master-data/investors";

export default async function InvestorsPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string; q?: string; page?: string; status?: string };
}) {
  const { error, edit, q, page: pageParam, status } = searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase.from("investors").select("*", { count: "exact" }).order("investor_code");
  if (q) query = query.or(`investor_code.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  const from = (page - 1) * PAGE_SIZE;
  const { data: investors, count } = await query.range(from, from + PAGE_SIZE - 1);

  const investorIds = (investors ?? []).map((i) => i.id);
  const { data: ownershipRows } = investorIds.length
    ? await supabase
        .from("investor_ownerships")
        .select("investor_id, outlet_id, investment_amount, active")
        .in("investor_id", investorIds)
        .eq("active", true)
    : { data: [] };

  const statsByInvestor = new Map<string, { outletCount: number; totalInvestment: number }>();
  for (const row of ownershipRows ?? []) {
    const agg = statsByInvestor.get(row.investor_id) ?? { outletCount: 0, totalInvestment: 0 };
    agg.outletCount += 1;
    agg.totalInvestment += Number(row.investment_amount);
    statsByInvestor.set(row.investor_id, agg);
  }

  const editing = edit ? investors?.find((i) => i.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader title="Investor" />

      <form action={saveInvestor} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <FormField label="Kode Investor" required>
          <input name="investor_code" defaultValue={editing?.investor_code} required className={inputClass} />
        </FormField>
        <FormField label="Nama Lengkap" required span={2}>
          <input name="full_name" defaultValue={editing?.full_name} required className={inputClass} />
        </FormField>
        <FormField label="Email">
          <input type="email" name="email" defaultValue={editing?.email ?? ""} className={inputClass} />
        </FormField>
        <FormField label="Telepon">
          <input name="phone" defaultValue={editing?.phone ?? ""} className={inputClass} />
        </FormField>
        <FormField label="Status">
          <select name="status" defaultValue={editing?.status ?? "active"} className={inputClass}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </FormField>
        <div className="col-span-3">
          <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
            {editing ? "Simpan" : "Tambah"}
          </button>
        </div>
      </form>

      <SearchFilterBar
        basePath={BASE}
        searchQuery={q}
        searchPlaceholder="Cari kode, nama, atau email investor…"
        filters={[
          {
            name: "status",
            label: "Semua Status",
            defaultValue: status,
            options: [
              { value: "active", label: "active" },
              { value: "inactive", label: "inactive" },
            ],
          },
        ]}
      />

      <DataTable
        columns={[
          {
            header: "Kode",
            cell: (i) => (
              <Link href={`${BASE}/${i.id}`} className="text-navy underline font-medium">
                {i.investor_code}
              </Link>
            ),
          },
          { header: "Nama", cell: (i) => i.full_name },
          { header: "Email", cell: (i) => i.email ?? "—" },
          { header: "Telepon", cell: (i) => i.phone ?? "—" },
          { header: "Outlet Aktif", cell: (i) => statsByInvestor.get(i.id)?.outletCount ?? 0 },
          {
            header: "Total Investasi",
            cell: (i) =>
              `Rp ${(statsByInvestor.get(i.id)?.totalInvestment ?? 0).toLocaleString("id-ID")}`,
          },
          { header: "Akun Login", cell: (i) => <LoginStatusBadge hasProfile={!!i.profile_id} /> },
          { header: "Status", cell: (i) => <StatusBadge label={i.status} variant={i.status === "active" ? "success" : "neutral"} /> },
          {
            header: "",
            align: "right",
            cell: (i) => (
              <div className="space-x-3">
                <a href={`${BASE}?edit=${i.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleInvestorStatus} className="inline">
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="status" value={i.status} />
                  <ConfirmSubmitButton
                    confirmMessage={
                      i.status === "active"
                        ? `Nonaktifkan investor "${i.full_name}"? Riwayat kepemilikan tetap tersimpan.`
                        : `Aktifkan kembali investor "${i.full_name}"?`
                    }
                    className="text-gray-500 underline"
                  >
                    {i.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                  </ConfirmSubmitButton>
                </form>
              </div>
            ),
          },
        ]}
        rows={investors ?? []}
      />
      <Pagination basePath={BASE} searchParams={{ q, status }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
