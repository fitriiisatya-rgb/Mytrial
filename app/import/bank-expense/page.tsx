import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/master-data/page-header";
import { BankExpenseWizard } from "@/components/import/bank-expense-wizard";

export default async function BankExpenseImportPage() {
  const supabase = await createClient();
  const { data: entities } = await supabase.from("entities").select("id, name").eq("active", true).order("name");

  return (
    <div>
      <PageHeader
        title="Import Pengeluaran Bank"
        description="Hanya baris dengan Kredit > 0 yang diproses sebagai kandidat pengeluaran. Baris Debit saja tetap disimpan untuk audit tapi tidak diproses sebagai transaksi."
      />
      <BankExpenseWizard entities={entities ?? []} />
    </div>
  );
}
