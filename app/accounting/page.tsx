import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "../sign-out-button";

export default async function AccountingHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();

  return (
    <main className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-navy">Action Center — Akuntansi</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-gray-500">
        Masuk sebagai <b>{profile?.full_name}</b> ({profile?.role}). Auth + RLS Phase 1 terkonfirmasi jalan.
      </p>
      <div className="flex gap-4 mt-4">
        <Link href="/master-data" className="text-sm text-navy underline">
          Master Data →
        </Link>
        <Link href="/import" className="text-sm text-navy underline">
          Transaction Import →
        </Link>
      </div>
      <p className="text-sm text-gray-400 mt-4">
        Exception Center, Auto Journal, dan halaman lain di sidebar prototype dibangun di Phase 4-5.
      </p>
    </main>
  );
}
