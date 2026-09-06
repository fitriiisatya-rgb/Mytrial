"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";

const BASE = "/master-data/banks";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

export async function saveBank(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string | null;
  const coaId = formData.get("coa_id") as string;
  if (!coaId) fail("Setiap rekening bank wajib memiliki COA sendiri (Koreksi #1).");

  const row = {
    entity_id: formData.get("entity_id") as string,
    account_no: (formData.get("account_no") as string).trim(),
    account_name: (formData.get("account_name") as string).trim(),
    bank_name: (formData.get("bank_name") as string).trim(),
    coa_id: coaId,
    active: formData.get("active") === "on",
  };

  const { data, error } = id
    ? await supabase.from("banks").update(row).eq("id", id).select("id").single()
    : await supabase.from("banks").insert(row).select("id").single();

  if (error) {
    if (error.code === "23505") fail(`Rekening "${row.bank_name} — ${row.account_no}" sudah terdaftar.`);
    fail(error.message);
  }
  await logAudit(supabase, {
    userId: user.id,
    action: id ? "bank_updated" : "bank_created",
    entityTable: "banks",
    entityId: data.id,
    newValue: row,
  });

  revalidatePath(BASE);
  redirect(id ? `${BASE}/${id}` : BASE);
}

export async function toggleBankActive(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("banks").update({ active: !active }).eq("id", id);
  if (error) fail(error.message);
  await logAudit(supabase, {
    userId: user.id,
    action: active ? "bank_deactivated" : "bank_activated",
    entityTable: "banks",
    entityId: id,
    newValue: { active: !active },
  });

  revalidatePath(BASE);
  redirect(BASE);
}
