import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { ActiveBadge, OwnershipBadge } from "@/components/master-data/status-badge";

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("partnership_contracts")
    .select("*, outlets(id, outlet_code, outlet_name)")
    .eq("id", params.id)
    .single();
  if (!contract) notFound();

  const { data: ownerships } = await supabase
    .from("investor_ownerships")
    .select("*, investors(id, investor_code, full_name)")
    .eq("contract_id", contract.id)
    .order("start_date", { ascending: false });

  const activeTotal = (ownerships ?? [])
    .filter((o) => o.active)
    .reduce((sum, o) => sum + Number(o.ownership_pct), 0);

  return (
    <div>
      <Link href="/master-data/contracts" className="text-sm text-navy underline">
        ‹ Kembali ke daftar kontrak
      </Link>
      <PageHeader title={contract.contract_number} action={<ActiveBadge active={contract.active} />} />

      <div className="bg-white border border-border rounded-lg p-4 grid grid-cols-3 gap-4 mb-6">
        <div>
          <p className="text-xs uppercase text-gray-500">Outlet</p>
          <p className="text-sm mt-1">
            <Link href={`/master-data/outlets/${contract.outlets?.id}`} className="text-navy underline">
              {contract.outlets?.outlet_code} — {contract.outlets?.outlet_name}
            </Link>
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Periode</p>
          <p className="text-sm mt-1">
            {contract.start_date} → {contract.end_date}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Durasi</p>
          <p className="text-sm mt-1">{contract.duration_months ? `${contract.duration_months} bulan` : "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Total Investasi</p>
          <p className="text-sm mt-1">Rp {Number(contract.total_investment).toLocaleString("id-ID")}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">% Bagi Hasil Investor</p>
          <p className="text-sm mt-1">{contract.profit_distribution_pct}%</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">% Ditahan</p>
          <p className="text-sm mt-1">{contract.retained_profit_pct}%</p>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-navy">Ringkasan Kepemilikan Investor</h3>
        <OwnershipBadge totalPct={activeTotal} />
      </div>
      <DataTable
        emptyMessage="Belum ada investor pada kontrak ini."
        columns={[
          {
            header: "Investor",
            cell: (o) => (
              <Link href={`/master-data/investors/${o.investors?.id}`} className="text-navy underline">
                {o.investors?.investor_code} — {o.investors?.full_name}
              </Link>
            ),
          },
          { header: "% Kepemilikan", cell: (o) => `${o.ownership_pct}%` },
          { header: "Berlaku", cell: (o) => `${o.start_date} → ${o.end_date ?? "sekarang"}` },
          { header: "Status", cell: (o) => <ActiveBadge active={o.active} /> },
        ]}
        rows={ownerships ?? []}
      />
    </div>
  );
}
