import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "../sign-out-button";

export default async function FinanceHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();

  return (
    <main className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-navy">Finance Manager</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-gray-500">
        Masuk sebagai <b>{profile?.full_name}</b> ({profile?.role}).
      </p>
      <div className="flex gap-4 mt-4">
        <Link href="/master-data" className="text-sm text-navy underline">
          Master Data →
        </Link>
        <Link href="/import" className="text-sm text-navy underline">
          Transaction Import →
        </Link>
        <Link href="/mapping" className="text-sm text-navy underline">
          Mapping Engine →
        </Link>
        <Link href="/cashflow/dashboard" className="text-sm text-navy underline">
          Cashflow Management System →
        </Link>
      </div>
      <p className="text-sm text-gray-400 mt-4">
        Review &amp; approve journal, period reopen, dan approval bagi hasil dibangun di Phase 5 &amp; 8.
      </p>
    </main>
  );
}
