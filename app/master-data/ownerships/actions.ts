"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BASE = "/master-data/ownerships";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

export async function saveOwnership(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;
  const endDate = str(formData, "end_date");

  const row = {
    investor_id: formData.get("investor_id") as string,
    outlet_id: formData.get("outlet_id") as string,
    contract_id: formData.get("contract_id") as string,
    ownership_pct: str(formData, "ownership_pct")!,
    investment_amount: str(formData, "investment_amount") ?? "0",
    start_date: formData.get("start_date") as string,
    end_date: endDate,
    active: formData.get("active") === "on",
  };

  // Not caught here on purpose: fn_check_ownership_total (0002) rejects
  // this at the database level when the sum for the outlet's overlapping
  // date range would exceed 100% — that error message is what the user
  // sees via `fail(error.message)` below, not a duplicated app-side check.
  const { error } = id
    ? await supabase.from("investor_ownerships").update(row).eq("id", id)
    : await supabase.from("investor_ownerships").insert(row);

  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}

export async function toggleOwnershipActive(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("investor_ownerships").update({ active: !active }).eq("id", id);
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
