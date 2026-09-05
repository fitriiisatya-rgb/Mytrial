"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BASE = "/master-data/coa";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

export async function saveCoa(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;

  const row = {
    code: str(formData, "code")!,
    name: str(formData, "name")!,
    account_type: formData.get("account_type") as
      | "asset" | "liability" | "equity" | "revenue" | "cogs"
      | "operating_expense" | "other_income" | "other_expense",
    normal_balance: formData.get("normal_balance") as "debit" | "credit",
    parent_id: str(formData, "parent_id"),
    pnl_category: str(formData, "pnl_category"),
    reporting_order: Number(formData.get("reporting_order") ?? 0),
    active: formData.get("active") === "on",
  };

  const { error } = id ? await supabase.from("coa").update(row).eq("id", id) : await supabase.from("coa").insert(row);

  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}

export async function toggleCoaActive(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("coa").update({ active: !active }).eq("id", id);
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
