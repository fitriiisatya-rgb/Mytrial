import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/master-data/page-header";
import { ActiveBadge } from "@/components/master-data/status-badge";

export default async function BankDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: bank } = await supabase
    .from("banks")
    .select("*, entities(id, name), coa(code, name, account_type)")
    .eq("id", params.id)
    .single();
  if (!bank) notFound();

  const rows: [string, string][] = [
    ["Nama Bank", bank.bank_name],
    ["No. Rekening", bank.account_no],
    ["Nama Pemilik Rekening", bank.account_name],
    ["Entitas", bank.entities?.name ?? "—"],
    ["COA Terhubung", `${bank.coa?.code} — ${bank.coa?.name}`],
  ];

  return (
    <div>
      <Link href="/master-data/banks" className="text-sm text-navy underline">
        ‹ Kembali ke daftar rekening bank
      </Link>
      <PageHeader title={`${bank.bank_name} — ${bank.account_no}`} action={<ActiveBadge active={bank.active} />} />

      <div className="bg-white border border-border rounded-lg p-4 grid grid-cols-2 gap-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs uppercase text-gray-500">{label}</p>
            <p className="text-sm mt-1">{value}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Satu rekening dapat digunakan untuk membayar banyak outlet — rekening ini tidak terikat pada satu outlet
        tertentu.
      </p>
    </div>
  );
}
