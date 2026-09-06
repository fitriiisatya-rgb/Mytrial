import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { ActiveBadge, OwnershipBadge } from "@/components/master-data/status-badge";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "contract", label: "Kontrak Kemitraan" },
  { key: "ownership", label: "Investor / Kepemilikan" },
  { key: "bank", label: "Bank / Keuangan" },
] as const;

export default async function OutletDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "overview";
  const supabase = await createClient();
  const { data: outlet } = await supabase.from("outlets").select("*, entities(id, name)").eq("id", params.id).single();
  if (!outlet) notFound();

  return (
    <div>
      <Link href="/master-data/outlets" className="text-sm text-navy underline">
        ‹ Kembali ke daftar outlet
      </Link>
      <PageHeader
        title={`${outlet.outlet_code} — ${outlet.outlet_name}`}
        description={outlet.entities?.name}
        action={<ActiveBadge active={outlet.active} />}
      />

      <nav className="border-b border-border flex gap-1 mb-4">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`?tab=${t.key}`}
            className={`px-3 py-2 text-sm whitespace-nowrap ${
              tab === t.key ? "text-navy border-b-2 border-gold font-semibold" : "text-gray-500 hover:text-navy"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab outlet={outlet} />}
      {tab === "contract" && <ContractTab outletId={outlet.id} />}
      {tab === "ownership" && <OwnershipTab outletId={outlet.id} />}
      {tab === "bank" && <BankTab entityId={outlet.entity_id} entityName={outlet.entities?.name ?? "—"} />}
    </div>
  );
}

function OverviewTab({
  outlet,
}: {
  outlet: {
    outlet_code: string;
    outlet_name: string;
    area: string | null;
    address: string | null;
    opening_date: string | null;
    partnership_start: string | null;
    partnership_end: string | null;
    active: boolean;
    entities: { name: string } | null;
  };
}) {
  const rows: [string, string][] = [
    ["Kode Outlet", outlet.outlet_code],
    ["Nama Outlet", outlet.outlet_name],
    ["Entitas", outlet.entities?.name ?? "—"],
    ["Area", outlet.area ?? "—"],
    ["Alamat", outlet.address ?? "—"],
    ["Tanggal Buka", outlet.opening_date ?? "—"],
    ["Mulai Kemitraan", outlet.partnership_start ?? "—"],
    ["Akhir Kemitraan", outlet.partnership_end ?? "—"],
  ];
  return (
    <div className="bg-white border border-border rounded-lg p-4 grid grid-cols-2 gap-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs uppercase text-gray-500">{label}</p>
          <p className="text-sm mt-1">{value}</p>
        </div>
      ))}
    </div>
  );
}

async function ContractTab({ outletId }: { outletId: string }) {
  const supabase = await createClient();
  const { data: contracts } = await supabase
    .from("partnership_contracts")
    .select("*")
    .eq("outlet_id", outletId)
    .order("start_date", { ascending: false });

  return (
    <DataTable
      emptyMessage="Belum ada kontrak kemitraan untuk outlet ini."
      columns={[
        {
          header: "No. Kontrak",
          cell: (c) => (
            <Link href={`/master-data/contracts/${c.id}`} className="text-navy underline">
              {c.contract_number}
            </Link>
          ),
        },
        { header: "Periode", cell: (c) => `${c.start_date} → ${c.end_date}` },
        { header: "% Investor", cell: (c) => `${c.profit_distribution_pct}%` },
        { header: "% Ditahan", cell: (c) => `${c.retained_profit_pct}%` },
        { header: "Status", cell: (c) => <ActiveBadge active={c.active} /> },
      ]}
      rows={contracts ?? []}
    />
  );
}

async function OwnershipTab({ outletId }: { outletId: string }) {
  const supabase = await createClient();
  const { data: ownerships } = await supabase
    .from("investor_ownerships")
    .select("*, investors(id, investor_code, full_name)")
    .eq("outlet_id", outletId)
    .order("start_date", { ascending: false });

  const activeTotal = (ownerships ?? [])
    .filter((o) => o.active)
    .reduce((sum, o) => sum + Number(o.ownership_pct), 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-gray-500">Total kepemilikan aktif saat ini:</span>
        <OwnershipBadge totalPct={activeTotal} />
      </div>
      <DataTable
        emptyMessage="Belum ada investor untuk outlet ini."
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

async function BankTab({ entityId, entityName }: { entityId: string; entityName: string }) {
  const supabase = await createClient();
  const { data: banks } = await supabase
    .from("banks")
    .select("*, coa(code, name)")
    .eq("entity_id", entityId)
    .order("bank_name");

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Rekening bank milik entitas <b>{entityName}</b> — satu rekening dapat digunakan untuk membayar banyak
        outlet, sehingga daftar ini bukan rekening khusus outlet ini.
      </p>
      <DataTable
        emptyMessage="Entitas ini belum memiliki rekening bank."
        columns={[
          {
            header: "Bank",
            cell: (b) => (
              <Link href={`/master-data/banks/${b.id}`} className="text-navy underline">
                {b.bank_name}
              </Link>
            ),
          },
          { header: "No. Rekening", cell: (b) => b.account_no },
          { header: "COA", cell: (b) => `${b.coa?.code} — ${b.coa?.name}` },
          { header: "Status", cell: (b) => <ActiveBadge active={b.active} /> },
        ]}
        rows={banks ?? []}
      />
    </div>
  );
}
