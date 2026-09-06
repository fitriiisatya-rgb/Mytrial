import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { LoginStatusBadge, StatusBadge } from "@/components/master-data/status-badge";

export default async function InvestorDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: investor } = await supabase.from("investors").select("*").eq("id", params.id).single();
  if (!investor) notFound();

  const { data: ownerships } = await supabase
    .from("investor_ownerships")
    .select("*, outlets(id, outlet_code, outlet_name), partnership_contracts(contract_number, start_date, end_date)")
    .eq("investor_id", investor.id)
    .order("start_date", { ascending: false });

  const active = (ownerships ?? []).filter((o) => o.active);
  const historical = (ownerships ?? []).filter((o) => !o.active);

  return (
    <div>
      <Link href="/master-data/investors" className="text-sm text-navy underline">
        ‹ Kembali ke daftar investor
      </Link>
      <PageHeader
        title={`${investor.investor_code} — ${investor.full_name}`}
        action={<StatusBadge label={investor.status} variant={investor.status === "active" ? "success" : "neutral"} />}
      />

      <div className="bg-white border border-border rounded-lg p-4 grid grid-cols-3 gap-4 mb-6">
        <div>
          <p className="text-xs uppercase text-gray-500">Email</p>
          <p className="text-sm mt-1">{investor.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Telepon</p>
          <p className="text-sm mt-1">{investor.phone ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Akun Login</p>
          <p className="mt-1">
            <LoginStatusBadge hasProfile={!!investor.profile_id} />
          </p>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-navy mb-2">Investasi Aktif</h3>
      <DataTable
        emptyMessage="Belum ada investasi aktif."
        columns={[
          {
            header: "Outlet",
            cell: (o) => (
              <Link href={`/master-data/outlets/${o.outlets?.id}`} className="text-navy underline">
                {o.outlets?.outlet_code} — {o.outlets?.outlet_name}
              </Link>
            ),
          },
          { header: "% Kepemilikan", cell: (o) => `${o.ownership_pct}%` },
          { header: "Nilai Investasi", cell: (o) => `Rp ${Number(o.investment_amount).toLocaleString("id-ID")}` },
          {
            header: "Periode Kontrak",
            cell: (o) =>
              o.partnership_contracts ? `${o.partnership_contracts.start_date} → ${o.partnership_contracts.end_date}` : "—",
          },
          { header: "Berlaku Sejak", cell: (o) => o.start_date },
        ]}
        rows={active}
      />

      <h3 className="text-sm font-semibold text-navy mb-2 mt-6">Riwayat Investasi (Nonaktif)</h3>
      <DataTable
        emptyMessage="Tidak ada riwayat investasi nonaktif."
        columns={[
          {
            header: "Outlet",
            cell: (o) => (
              <Link href={`/master-data/outlets/${o.outlets?.id}`} className="text-navy underline">
                {o.outlets?.outlet_code} — {o.outlets?.outlet_name}
              </Link>
            ),
          },
          { header: "% Kepemilikan", cell: (o) => `${o.ownership_pct}%` },
          { header: "Berlaku", cell: (o) => `${o.start_date} → ${o.end_date ?? "—"}` },
        ]}
        rows={historical}
      />
    </div>
  );
}
