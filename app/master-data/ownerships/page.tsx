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
import { createOwnership, endOwnership, toggleOwnershipActive } from "./actions";

const PAGE_SIZE = 20;
const BASE = "/master-data/ownerships";
const today = () => new Date().toISOString().slice(0, 10);

export default async function OwnershipsPage({
  searchParams,
}: {
  searchParams: { error?: string; q?: string; page?: string; investor?: string; outlet?: string };
}) {
  const { error, q, page: pageParam, investor, outlet } = searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("investor_ownerships")
    .select(
      "*, investors(investor_code, full_name), outlets(outlet_code, outlet_name), partnership_contracts(contract_number)",
      { count: "exact" }
    )
    .order("start_date", { ascending: false });
  if (investor) query = query.eq("investor_id", investor);
  if (outlet) query = query.eq("outlet_id", outlet);
  if (q) {
    // investor_ownerships has no free-text column of its own — resolve the
    // search against the two tables it's usually searched by first, so
    // pagination/count stay correct instead of filtering only the current
    // page's rows client-side.
    const [{ data: matchedInvestors }, { data: matchedOutlets }] = await Promise.all([
      supabase.from("investors").select("id").or(`full_name.ilike.%${q}%,investor_code.ilike.%${q}%`),
      supabase.from("outlets").select("id").or(`outlet_name.ilike.%${q}%,outlet_code.ilike.%${q}%`),
    ]);
    const ids = [...(matchedInvestors ?? []).map((i) => i.id), ...(matchedOutlets ?? []).map((o) => o.id)];
    if (ids.length === 0) {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // no match — empty result
    } else {
      const investorIds = (matchedInvestors ?? []).map((i) => i.id);
      const outletIds = (matchedOutlets ?? []).map((o) => o.id);
      const clauses = [
        ...(investorIds.length ? [`investor_id.in.(${investorIds.join(",")})`] : []),
        ...(outletIds.length ? [`outlet_id.in.(${outletIds.join(",")})`] : []),
      ];
      query = query.or(clauses.join(","));
    }
  }
  const from = (page - 1) * PAGE_SIZE;
  const { data: ownerships, count } = await query.range(from, from + PAGE_SIZE - 1);
  const filtered = ownerships ?? [];

  const [{ data: investors }, { data: outlets }, { data: contracts }] = await Promise.all([
    supabase.from("investors").select("id, investor_code, full_name").eq("status", "active").order("investor_code"),
    supabase.from("outlets").select("id, outlet_code, outlet_name").eq("active", true).order("outlet_code"),
    supabase
      .from("partnership_contracts")
      .select("id, contract_number, outlets(outlet_code)")
      .eq("active", true)
      .order("contract_number"),
  ]);
  const role = await getCurrentRole(supabase);
  const canEdit = canWrite(role, "investor_ownerships");

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader
        title="Kepemilikan Investor"
        description={
          "Kepemilikan berlaku berdasarkan rentang tanggal (Koreksi #4). Untuk mengganti kepemilikan: akhiri baris " +
          "lama, lalu tambah baris baru — baris yang sudah pernah berlaku tidak pernah ditimpa. Total kepemilikan " +
          "aktif per outlet pada rentang tanggal yang sama tidak boleh melebihi 100%; database akan menolak jika " +
          "melebihi."
        }
      />

      {canEdit ? (
        <form action={createOwnership} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
          <FormField label="Investor" required>
            <select name="investor_id" required className={inputClass}>
              <option value="">Pilih investor…</option>
              {investors?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.investor_code} — {i.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Outlet" required>
            <select name="outlet_id" required className={inputClass}>
              <option value="">Pilih outlet…</option>
              {outlets?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.outlet_code} — {o.outlet_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Kontrak" required>
            <select name="contract_id" required className={inputClass}>
              <option value="">Pilih kontrak…</option>
              {contracts?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.outlets?.outlet_code} — {c.contract_number}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="% Kepemilikan" required>
            <input type="number" step="0.000001" min="0" max="100" name="ownership_pct" required className={inputClass} />
          </FormField>
          <FormField label="Nilai Investasi (Rp)">
            <input type="number" step="0.01" name="investment_amount" defaultValue="0" className={inputClass} />
          </FormField>
          <FormField label="Berlaku Sejak" required>
            <input type="date" name="start_date" defaultValue={today()} required className={inputClass} />
          </FormField>
          <FormField label="Berakhir (opsional)">
            <input type="date" name="end_date" className={inputClass} />
          </FormField>
          <div className="col-span-3">
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              Tambah Kepemilikan
            </button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-gray-400 mb-4">
          Peran Anda tidak memiliki izin mengelola kepemilikan investor — hanya dapat melihat daftar di bawah.
        </p>
      )}

      <SearchFilterBar
        basePath={BASE}
        searchQuery={q}
        searchPlaceholder="Cari nama investor atau outlet…"
        filters={[
          {
            name: "investor",
            label: "Semua Investor",
            defaultValue: investor,
            options: (investors ?? []).map((i) => ({ value: i.id, label: `${i.investor_code} — ${i.full_name}` })),
          },
          {
            name: "outlet",
            label: "Semua Outlet",
            defaultValue: outlet,
            options: (outlets ?? []).map((o) => ({ value: o.id, label: `${o.outlet_code} — ${o.outlet_name}` })),
          },
        ]}
      />

      <DataTable
        columns={[
          { header: "Investor", cell: (o) => `${o.investors?.investor_code} — ${o.investors?.full_name}` },
          { header: "Outlet", cell: (o) => `${o.outlets?.outlet_code} — ${o.outlets?.outlet_name}` },
          { header: "Kontrak", cell: (o) => o.partnership_contracts?.contract_number ?? "—" },
          { header: "%", cell: (o) => `${o.ownership_pct}%` },
          { header: "Berlaku", cell: (o) => `${o.start_date} → ${o.end_date ?? "sekarang"}` },
          { header: "Status", cell: (o) => <ActiveBadge active={o.active} /> },
          {
            header: "",
            align: "right",
            cell: (o) =>
              canEdit ? (
                <div className="flex justify-end items-center gap-3">
                  {o.active && !o.end_date && (
                    <form action={endOwnership} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="date" name="end_date" defaultValue={today()} className="border border-border rounded px-2 py-1 text-xs" />
                      <ConfirmSubmitButton
                        confirmMessage={`Akhiri kepemilikan ${o.investors?.full_name} di outlet ${o.outlets?.outlet_name}? Baris ini akan berhenti berlaku sejak tanggal yang dipilih — riwayatnya tetap tersimpan.`}
                        className="text-gray-500 underline text-xs"
                      >
                        Akhiri
                      </ConfirmSubmitButton>
                    </form>
                  )}
                  <form action={toggleOwnershipActive} className="inline">
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="active" value={String(o.active)} />
                    <ConfirmSubmitButton
                      confirmMessage={o.active ? "Nonaktifkan baris kepemilikan ini?" : "Aktifkan kembali baris kepemilikan ini?"}
                      className="text-gray-500 underline text-xs"
                    >
                      {o.active ? "Nonaktifkan" : "Aktifkan"}
                    </ConfirmSubmitButton>
                  </form>
                </div>
              ) : null,
          },
        ]}
        rows={filtered}
      />
      <Pagination basePath={BASE} searchParams={{ q, investor, outlet }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
