import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { Pagination } from "@/components/master-data/pagination";
import { SearchFilterBar } from "@/components/master-data/search-filter-bar";
import { ActiveBadge, OwnershipBadge } from "@/components/master-data/status-badge";
import { ConfirmSubmitButton } from "@/components/master-data/confirm-submit-button";
import { FormField, inputClass } from "@/components/master-data/form-field";
import { saveOutlet, toggleOutletActive } from "./actions";

const PAGE_SIZE = 20;
const BASE = "/master-data/outlets";

export default async function OutletsPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string; q?: string; page?: string; entity?: string; status?: string };
}) {
  const { error, edit, q, page: pageParam, entity, status } = searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase.from("outlets").select("*, entities(name)", { count: "exact" }).order("outlet_code");
  if (q) query = query.or(`outlet_code.ilike.%${q}%,outlet_name.ilike.%${q}%`);
  if (entity) query = query.eq("entity_id", entity);
  if (status) query = query.eq("active", status === "active");
  const from = (page - 1) * PAGE_SIZE;
  const { data: outlets, count } = await query.range(from, from + PAGE_SIZE - 1);

  const outletIds = (outlets ?? []).map((o) => o.id);
  const { data: ownershipRows } = outletIds.length
    ? await supabase
        .from("investor_ownerships")
        .select("outlet_id, investor_id, ownership_pct, active")
        .in("outlet_id", outletIds)
        .eq("active", true)
    : { data: [] };

  const ownershipByOutlet = new Map<string, { totalPct: number; investorCount: number }>();
  for (const row of ownershipRows ?? []) {
    const agg = ownershipByOutlet.get(row.outlet_id) ?? { totalPct: 0, investorCount: 0 };
    agg.totalPct += Number(row.ownership_pct);
    agg.investorCount += 1;
    ownershipByOutlet.set(row.outlet_id, agg);
  }

  const { data: entities } = await supabase.from("entities").select("id, name").eq("active", true).order("name");
  const editing = edit ? outlets?.find((o) => o.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader title="Outlet" description="Setiap outlet dimiliki oleh satu entitas dan dapat memiliki beberapa investor sekaligus." />

      <form action={saveOutlet} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <FormField label="Entitas" required>
          <select name="entity_id" defaultValue={editing?.entity_id} required className={inputClass}>
            <option value="">Pilih entitas…</option>
            {entities?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Kode Outlet" required>
          <input name="outlet_code" defaultValue={editing?.outlet_code} required className={inputClass} />
        </FormField>
        <FormField label="Nama Outlet" required>
          <input name="outlet_name" defaultValue={editing?.outlet_name} required className={inputClass} />
        </FormField>
        <FormField label="Area">
          <input name="area" defaultValue={editing?.area ?? ""} className={inputClass} />
        </FormField>
        <FormField label="Alamat" span={2}>
          <input name="address" defaultValue={editing?.address ?? ""} className={inputClass} />
        </FormField>
        <FormField label="Mulai Kemitraan">
          <input type="date" name="partnership_start" defaultValue={editing?.partnership_start ?? ""} className={inputClass} />
        </FormField>
        <FormField label="Akhir Kemitraan">
          <input type="date" name="partnership_end" defaultValue={editing?.partnership_end ?? ""} className={inputClass} />
        </FormField>
        <FormField label="Tanggal Buka">
          <input type="date" name="opening_date" defaultValue={editing?.opening_date ?? ""} className={inputClass} />
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

      <SearchFilterBar
        basePath={BASE}
        searchQuery={q}
        searchPlaceholder="Cari kode atau nama outlet…"
        filters={[
          {
            name: "entity",
            label: "Semua Entitas",
            defaultValue: entity,
            options: (entities ?? []).map((e) => ({ value: e.id, label: e.name })),
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
            header: "Kode",
            cell: (o) => (
              <Link href={`${BASE}/${o.id}`} className="text-navy underline font-medium">
                {o.outlet_code}
              </Link>
            ),
          },
          { header: "Nama", cell: (o) => o.outlet_name },
          { header: "Entitas", cell: (o) => o.entities?.name ?? "—" },
          { header: "Area", cell: (o) => o.area ?? "—" },
          { header: "Mulai Kemitraan", cell: (o) => o.partnership_start ?? "—" },
          { header: "Investor", cell: (o) => ownershipByOutlet.get(o.id)?.investorCount ?? 0 },
          {
            header: "Kepemilikan",
            cell: (o) => <OwnershipBadge totalPct={ownershipByOutlet.get(o.id)?.totalPct ?? 0} />,
          },
          { header: "Status", cell: (o) => <ActiveBadge active={o.active} /> },
          {
            header: "",
            align: "right",
            cell: (o) => (
              <div className="space-x-3">
                <a href={`${BASE}?edit=${o.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleOutletActive} className="inline">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="active" value={String(o.active)} />
                  <ConfirmSubmitButton
                    confirmMessage={
                      o.active
                        ? `Nonaktifkan outlet "${o.outlet_name}"? Riwayat transaksi & kepemilikan tetap tersimpan.`
                        : `Aktifkan kembali outlet "${o.outlet_name}"?`
                    }
                    className="text-gray-500 underline"
                  >
                    {o.active ? "Nonaktifkan" : "Aktifkan"}
                  </ConfirmSubmitButton>
                </form>
              </div>
            ),
          },
        ]}
        rows={outlets ?? []}
      />
      <Pagination basePath={BASE} searchParams={{ q, entity, status }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
