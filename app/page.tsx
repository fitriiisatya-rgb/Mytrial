import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ROLE_HOME: Record<string, string> = {
  investor: "/investor",
  accounting: "/accounting",
  // Finance & Management land straight in the Cashflow Management System —
  // that's their day-to-day tool. /finance and /management still exist for
  // the accounting-side placeholders (linked from there).
  finance_manager: "/cashflow/dashboard",
  management: "/cashflow/dashboard",
  super_admin: "/admin",
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  redirect(ROLE_HOME[profile?.role ?? ""] ?? "/login");
}
