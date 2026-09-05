"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BASE = "/master-data/investors";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

export async function saveInvestor(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;

  const row = {
    investor_code: str(formData, "investor_code")!,
    full_name: str(formData, "full_name")!,
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    status: (formData.get("status") as string) || "active",
  };

  const { error } = id
    ? await supabase.from("investors").update(row).eq("id", id)
    : await supabase.from("investors").insert(row);

  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}

export async function toggleInvestorStatus(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;

  const { error } = await supabase
    .from("investors")
    .update({ status: status === "active" ? "inactive" : "active" })
    .eq("id", id);
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
