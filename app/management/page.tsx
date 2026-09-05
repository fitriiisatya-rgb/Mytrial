import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "../sign-out-button";

export default async function ManagementHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();

  return (
    <main className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-navy">Management Dashboard</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-gray-500">
        Masuk sebagai <b>{profile?.full_name}</b> ({profile?.role}).
      </p>
      <Link href="/master-data" className="inline-block mt-4 text-sm text-navy underline">
        Master Data →
      </Link>
      <p className="text-sm text-gray-400 mt-4">Laporan konsolidasi dibangun di Phase 6.</p>
    </main>
  );
}
