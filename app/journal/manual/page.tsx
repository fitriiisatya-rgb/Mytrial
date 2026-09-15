import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { ManualJournalForm } from "@/components/journal/manual-journal-form";

export default async function ManualJournalPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = await createClient();
  const [{ data: entities }, { data: coa }, { data: outlets }] = await Promise.all([
    supabase.from("entities").select("id, name").eq("active", true).order("name"),
    supabase.from("coa").select("id, code, name").eq("active", true).order("code"),
    supabase.from("outlets").select("id, outlet_name").eq("active", true).order("outlet_name"),
  ]);

  return (
    <div>
      <ErrorBanner message={searchParams.error} />
      <PageHeader
        title="Manual Journal"
        description="Untuk accrual, koreksi, depresiasi, prepaid, penyesuaian persediaan, dan penyesuaian penutupan. Jurnal manual mengikuti alur Draft → Reviewed → Approved → Posted yang sama seperti jurnal otomatis."
      />
      <ManualJournalForm entities={entities ?? []} coa={coa ?? []} outlets={outlets ?? []} />
    </div>
  );
}
