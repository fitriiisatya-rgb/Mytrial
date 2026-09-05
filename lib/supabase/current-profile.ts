import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Shared by every server-rendered page that needs "who is logged in and
 * what's their role" — redirects to /login if there's no session. This is
 * a UX convenience only; RLS (0008) is what actually enforces access to
 * any row a page then queries.
 */
export async function requireProfile(supabase: SupabaseClient<Database>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();
  if (!profile) redirect("/login");

  return { user, profile };
}
