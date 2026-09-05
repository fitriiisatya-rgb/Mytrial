import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ROLE_HOME: Record<string, string> = {
  investor: "/investor",
  accounting: "/accounting",
  finance_manager: "/finance",
  management: "/management",
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
