"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";

const BASE = "/master-data/entities";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

export async function saveEntity(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string | null;
  const code = (formData.get("code") as string).trim();
  const name = (formData.get("name") as string).trim();
  const active = formData.get("active") === "on";
  const row = { code, name, active };

  const { data, error } = id
    ? await supabase.from("entities").update(row).eq("id", id).select("id").single()
    : await supabase.from("entities").insert(row).select("id").single();

  if (error) fail(error.message);
  await logAudit(supabase, {
    userId: user.id,
    action: id ? "entity_updated" : "entity_created",
    entityTable: "entities",
    entityId: data.id,
    newValue: row,
  });

  revalidatePath(BASE);
  redirect(BASE);
}

export async function toggleEntityActive(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("entities").update({ active: !active }).eq("id", id);
  if (error) fail(error.message);
  await logAudit(supabase, {
    userId: user.id,
    action: active ? "entity_deactivated" : "entity_activated",
    entityTable: "entities",
    entityId: id,
    newValue: { active: !active },
  });

  revalidatePath(BASE);
  redirect(BASE);
}
