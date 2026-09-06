"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";

const BASE = "/cashflow/settings/alerts";

export async function updateAlertRule(formData: FormData) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) redirect(`${BASE}?error=${encodeURIComponent("Anda tidak memiliki akses.")}`);

  const id = formData.get("id") as string;
  const thresholdAmountRaw = formData.get("threshold_amount") as string | null;
  const thresholdHoursRaw = formData.get("threshold_hours") as string | null;

  await supabase
    .from("alert_rules")
    .update({
      threshold_amount: thresholdAmountRaw ? thresholdAmountRaw : null,
      threshold_hours: thresholdHoursRaw ? Number(thresholdHoursRaw) : null,
      is_active: formData.get("is_active") === "on",
    })
    .eq("id", id);

  revalidatePath(BASE);
  redirect(BASE);
}

export async function acknowledgeAlert(formData: FormData) {
  const supabase = await createClient();
  const { user } = await requireCashflowAccess(supabase);
  const id = formData.get("id") as string;
  await supabase
    .from("cashflow_alerts")
    .update({ status: "ACKNOWLEDGED", acknowledged_by: user.id, acknowledged_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(BASE);
  revalidatePath("/cashflow/dashboard");
  redirect(BASE);
}
