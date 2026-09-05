import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { requireProfile } from "@/lib/supabase/current-profile";

/** Cashflow module users: Finance (operates) and Management (reads), plus super_admin. Accounting/investor roles have no RLS policy on cashflow tables either — this is a UX-level guard on top of that DB-level denial. */
const CASHFLOW_ROLES = ["super_admin", "finance_manager", "management"] as const;

export async function requireCashflowAccess(supabase: SupabaseClient<Database>) {
  const { user, profile } = await requireProfile(supabase);
  if (!CASHFLOW_ROLES.includes(profile.role as (typeof CASHFLOW_ROLES)[number])) {
    redirect("/");
  }
  return { user, profile, canWrite: profile.role === "super_admin" || profile.role === "finance_manager" };
}
