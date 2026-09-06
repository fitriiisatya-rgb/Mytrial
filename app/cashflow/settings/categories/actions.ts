"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";

const BASE = "/cashflow/settings/categories";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

export async function saveCategory(formData: FormData) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses untuk mengubah kategori.");

  const id = formData.get("id") as string | null;
  const row = {
    code: (formData.get("code") as string).trim().toUpperCase(),
    name: (formData.get("name") as string).trim(),
    type: formData.get("type") as "CASH_IN" | "CASH_OUT",
    is_active: formData.get("is_active") === "on",
  };

  const { error } = id
    ? await supabase.from("cashflow_categories").update(row).eq("id", id)
    : await supabase.from("cashflow_categories").insert(row);

  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}

export async function toggleCategoryActive(formData: FormData) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses.");

  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const { error } = await supabase.from("cashflow_categories").update({ is_active: !active }).eq("id", id);
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
