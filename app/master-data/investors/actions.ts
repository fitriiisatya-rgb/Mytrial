"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";

const BASE = "/master-data/investors";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

export async function saveInvestor(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string | null;
  // profile_id (akun login) is intentionally never set from this form —
  // that requires an invite flow (create auth user + profiles row) that
  // belongs to Phase 3 User Management, not master-data CRUD. An investor
  // created here has no login account yet, which is expected, not an
  // error state.
  const row = {
    investor_code: str(formData, "investor_code")!,
    full_name: str(formData, "full_name")!,
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    status: (formData.get("status") as string) || "active",
  };

  const { data, error } = id
    ? await supabase.from("investors").update(row).eq("id", id).select("id").single()
    : await supabase.from("investors").insert(row).select("id").single();

  if (error) {
    if (error.code === "23505") fail(`Kode investor "${row.investor_code}" sudah digunakan.`);
    fail(error.message);
  }
  await logAudit(supabase, {
    userId: user.id,
    action: id ? "investor_updated" : "investor_created",
    entityTable: "investors",
    entityId: data.id,
    newValue: row,
  });

  revalidatePath(BASE);
  redirect(id ? `${BASE}/${id}` : BASE);
}

export async function toggleInvestorStatus(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  const nextStatus = status === "active" ? "inactive" : "active";

  const { error } = await supabase.from("investors").update({ status: nextStatus }).eq("id", id);
  if (error) fail(error.message);
  await logAudit(supabase, {
    userId: user.id,
    action: nextStatus === "inactive" ? "investor_deactivated" : "investor_activated",
    entityTable: "investors",
    entityId: id,
    newValue: { status: nextStatus },
  });

  revalidatePath(BASE);
  redirect(BASE);
}
