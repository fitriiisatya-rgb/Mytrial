"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BASE = "/master-data/banks";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

export async function saveBank(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;

  const row = {
    entity_id: formData.get("entity_id") as string,
    account_no: (formData.get("account_no") as string).trim(),
    account_name: (formData.get("account_name") as string).trim(),
    bank_name: (formData.get("bank_name") as string).trim(),
    // CORRECTION #1: mandatory, bank-specific COA — never a shared/generic
    // cash account. The form itself requires this select to be filled;
    // the NOT NULL constraint (0002) is the real, DB-level guarantee.
    coa_id: formData.get("coa_id") as string,
    active: formData.get("active") === "on",
  };

  const { error } = id
    ? await supabase.from("banks").update(row).eq("id", id)
    : await supabase.from("banks").insert(row);

  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}

export async function toggleBankActive(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("banks").update({ active: !active }).eq("id", id);
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
