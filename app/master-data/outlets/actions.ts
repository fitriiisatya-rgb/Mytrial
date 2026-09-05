"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BASE = "/master-data/outlets";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

export async function saveOutlet(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;

  const row = {
    entity_id: formData.get("entity_id") as string,
    outlet_code: str(formData, "outlet_code")!,
    outlet_name: str(formData, "outlet_name")!,
    area: str(formData, "area"),
    address: str(formData, "address"),
    opening_date: str(formData, "opening_date"),
    partnership_start: str(formData, "partnership_start"),
    partnership_end: str(formData, "partnership_end"),
    active: formData.get("active") === "on",
  };

  const { error } = id
    ? await supabase.from("outlets").update(row).eq("id", id)
    : await supabase.from("outlets").insert(row);

  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}

export async function toggleOutletActive(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("outlets").update({ active: !active }).eq("id", id);
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
