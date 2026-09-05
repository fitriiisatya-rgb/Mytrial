"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

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

  const { data, error } = id
    ? await supabase.from("outlets").update(row).eq("id", id).select("id").single()
    : await supabase.from("outlets").insert(row).select("id").single();

  if (error) {
    // Postgres unique_violation on outlet_code surfaces as a raw
    // constraint-name error — translate it to something a non-technical
    // user can act on instead.
    if (error.code === "23505") fail(`Kode outlet "${row.outlet_code}" sudah digunakan.`);
    fail(error.message);
  }
  await logAudit(supabase, {
    userId: user.id,
    action: id ? "outlet_updated" : "outlet_created",
    entityTable: "outlets",
    entityId: data.id,
    newValue: row,
  });

  revalidatePath(BASE);
  redirect(id ? `${BASE}/${id}` : BASE);
}

export async function toggleOutletActive(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("outlets").update({ active: !active }).eq("id", id);
  if (error) fail(error.message);
  await logAudit(supabase, {
    userId: user.id,
    action: active ? "outlet_deactivated" : "outlet_activated",
    entityTable: "outlets",
    entityId: id,
    newValue: { active: !active },
  });

  revalidatePath(BASE);
  redirect(BASE);
}
