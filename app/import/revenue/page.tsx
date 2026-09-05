import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/master-data/page-header";
import { RevenueWizard } from "@/components/import/revenue-wizard";

export default async function RevenueImportPage() {
  const supabase = await createClient();
  const [{ data: entities }, { data: revenueSources }] = await Promise.all([
    supabase.from("entities").select("id, name").eq("active", true).order("name"),
    supabase.from("revenue_sources").select("id, code, name").eq("active", true).order("code"),
  ]);

  return (
    <div>
      <PageHeader
        title="Import Penerimaan"
        description="Generic revenue importer — menyimpan data ternormalisasi saja, tidak ada logika COA atau jurnal (itu Phase 4)."
      />
      <RevenueWizard entities={entities ?? []} revenueSources={revenueSources ?? []} />
    </div>
  );
}
