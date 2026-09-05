import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "../sign-out-button";

export default async function InvestorHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Deliberately query through RLS, not a service-role client — if the
  // investor policy in 0008 is ever wrong, this page should break loudly
  // in testing rather than leak data quietly.
  const { data: ownerships } = await supabase
    .from("investor_ownerships")
    .select("outlet_id, ownership_pct, outlets(outlet_name)")
    .eq("active", true);

  return (
    <main className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-navy">Portal Investor</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-gray-500 mb-4">Outlet yang Anda miliki:</p>
      <ul className="text-sm space-y-1">
        {ownerships?.map((o: { outlet_id: string; ownership_pct: string; outlets: { outlet_name: string } | null }, i: number) => (
          <li key={i}>
            {o.outlets?.outlet_name} — {o.ownership_pct}%
          </li>
        ))}
      </ul>
      <p className="text-sm text-gray-400 mt-6">
        P&amp;L dan riwayat bagi hasil per outlet (hanya yang Published) dibangun di Phase 9.
      </p>
    </main>
  );
}
