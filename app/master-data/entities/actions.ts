"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BASE = "/master-data/entities";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

export async function saveEntity(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;
  const code = (formData.get("code") as string).trim();
  const name = (formData.get("name") as string).trim();
  const active = formData.get("active") === "on";

  const { error } = id
    ? await supabase.from("entities").update({ code, name, active }).eq("id", id)
    : await supabase.from("entities").insert({ code, name, active });

  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}

export async function toggleEntityActive(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("entities").update({ active: !active }).eq("id", id);
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
