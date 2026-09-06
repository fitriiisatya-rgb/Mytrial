"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string | null;
  const durationMonths = str(formData, "duration_months");
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  if (endDate <= startDate) fail("Tanggal berakhir harus setelah tanggal mulai.");

  // retained_profit_pct is a generated column (100 - profit_distribution_pct)
  // — the "distribution % + retained % = 100%" business rule is enforced
  // by that formula itself, not a separate check here.
  const row = {
    outlet_id: formData.get("outlet_id") as string,
    contract_number: str(formData, "contract_number")!,
    start_date: startDate,
    end_date: endDate,
    duration_months: durationMonths ? Number(durationMonths) : null,
    total_investment: str(formData, "total_investment") ?? "0",
    profit_distribution_pct: str(formData, "profit_distribution_pct")!,
    active: formData.get("active") === "on",
  };

  const { data, error } = id
    ? await supabase.from("partnership_contracts").update(row).eq("id", id).select("id").single()
    : await supabase.from("partnership_contracts").insert(row).select("id").single();

  if (error) {
    if (error.code === "23505") fail(`No. kontrak "${row.contract_number}" sudah digunakan.`);
    fail(error.message);
  }
  await logAudit(supabase, {
    userId: user.id,
    action: id ? "contract_updated" : "contract_created",
    entityTable: "partnership_contracts",
    entityId: data.id,
    newValue: row,
  });

  revalidatePath(BASE);
  redirect(id ? `${BASE}/${id}` : BASE);
}

export async function toggleContractActive(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("partnership_contracts").update({ active: !active }).eq("id", id);
  if (error) fail(error.message);
  await logAudit(supabase, {
    userId: user.id,
    action: active ? "contract_deactivated" : "contract_activated",
    entityTable: "partnership_contracts",
    entityId: id,
    newValue: { active: !active },
  });

  revalidatePath(BASE);
  redirect(BASE);
}
