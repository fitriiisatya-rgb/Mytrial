"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";

const BASE = "/cashflow/settings/accounts";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

export async function saveBankAccount(formData: FormData) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses untuk mengubah rekening.");

  const id = formData.get("id") as string | null;
  const row = {
    account_code: (formData.get("account_code") as string).trim().toUpperCase(),
    account_name: (formData.get("account_name") as string).trim(),
    bank_name: (formData.get("bank_name") as string).trim(),
    account_number: ((formData.get("account_number") as string) || "").trim() || null,
    entity_label: ((formData.get("entity_label") as string) || "").trim() || null,
    opening_balance: (formData.get("opening_balance") as string) || "0",
    opening_balance_date: formData.get("opening_balance_date") as string,
    sheet_label: ((formData.get("sheet_label") as string) || "").trim() || null,
    is_active: formData.get("is_active") === "on",
  };

  const { error } = id
    ? await supabase.from("bank_accounts").update(row).eq("id", id)
    : await supabase.from("bank_accounts").insert(row);

  revalidatePath(BASE);
  revalidatePath("/cashflow/dashboard");
  revalidatePath("/cashflow/accounts");
  if (error) fail(error.message);
  redirect(BASE);
}

export async function toggleAccountActive(formData: FormData) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses.");

  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const { error } = await supabase.from("bank_accounts").update({ is_active: !active }).eq("id", id);
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
