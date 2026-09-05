import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/master-data/page-header";
import { ActiveBadge } from "@/components/master-data/status-badge";

export default async function EntityDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: entity } = await supabase.from("entities").select("*").eq("id", params.id).single();
  if (!entity) notFound();

  const [{ count: outletCount }, { count: bankCount }] = await Promise.all([
    supabase.from("outlets").select("id", { count: "exact", head: true }).eq("entity_id", entity.id),
    supabase.from("banks").select("id", { count: "exact", head: true }).eq("entity_id", entity.id),
  ]);

  return (
    <div>
      <Link href="/master-data/entities" className="text-sm text-navy underline">
        ‹ Kembali ke daftar entitas
      </Link>
      <PageHeader
        title={`${entity.code} — ${entity.name}`}
        action={<ActiveBadge active={entity.active} />}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-border rounded-lg p-4">
          <p className="text-xs uppercase text-gray-500">Jumlah Outlet</p>
          <p className="text-2xl font-bold text-navy mt-1">{outletCount ?? 0}</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4">
          <p className="text-xs uppercase text-gray-500">Jumlah Rekening Bank</p>
          <p className="text-2xl font-bold text-navy mt-1">{bankCount ?? 0}</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4">
          <p className="text-xs uppercase text-gray-500">Status</p>
          <p className="text-2xl font-bold text-navy mt-1">{entity.active ? "Aktif" : "Nonaktif"}</p>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Dibuat {new Date(entity.created_at).toLocaleDateString("id-ID")}
      </p>
    </div>
  );
}
