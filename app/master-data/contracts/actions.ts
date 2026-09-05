"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BASE = "/master-data/contracts";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

export async function saveContract(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;
  const durationMonths = str(formData, "duration_months");

  const row = {
    outlet_id: formData.get("outlet_id") as string,
    contract_number: str(formData, "contract_number")!,
    start_date: formData.get("start_date") as string,
    end_date: formData.get("end_date") as string,
    duration_months: durationMonths ? Number(durationMonths) : null,
    total_investment: str(formData, "total_investment") ?? "0",
    profit_distribution_pct: str(formData, "profit_distribution_pct")!,
    active: formData.get("active") === "on",
  };

  const { error } = id
    ? await supabase.from("partnership_contracts").update(row).eq("id", id)
    : await supabase.from("partnership_contracts").insert(row);

  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}

export async function toggleContractActive(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("partnership_contracts").update({ active: !active }).eq("id", id);
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
