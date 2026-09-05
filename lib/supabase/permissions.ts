import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type UserRole = Database["public"]["Enums"]["user_role"];

/** Mirrors the RLS `staff_rw_*` policies in 0008 — used only to decide
 * whether to show a Create/Edit affordance at all. RLS (not this map) is
 * the actual security boundary; hiding a control a role couldn't use
 * anyway is a UX courtesy, never a substitute for the server-side check. */
const WRITE_ROLES = {
  entities: ["super_admin", "accounting", "finance_manager", "management"],
  outlets: ["super_admin", "accounting", "finance_manager", "management"],
  coa: ["super_admin", "accounting", "finance_manager", "management"],
  investors: ["super_admin", "accounting", "finance_manager", "management"],
  banks: ["super_admin", "accounting", "finance_manager"],
  partnership_contracts: ["super_admin", "accounting", "finance_manager"],
  investor_ownerships: ["super_admin", "accounting", "finance_manager"],
} satisfies Record<string, UserRole[]>;

export async function getCurrentRole(supabase: SupabaseClient<Database>): Promise<UserRole | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return data?.role ?? null;
}

export function canWrite(role: UserRole | null, table: keyof typeof WRITE_ROLES): boolean {
  return !!role && (WRITE_ROLES[table] as UserRole[]).includes(role);
}
