"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { runGoogleSheetSync } from "@/lib/cashflow/syncService";

const BASE = "/cashflow/settings/sync";

export async function triggerSyncNow() {
  const supabase = await createClient();
  const { user, canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) redirect(`${BASE}?error=${encodeURIComponent("Anda tidak memiliki akses untuk menjalankan sync.")}`);

  try {
    const result = await runGoogleSheetSync(supabase, { triggeredBy: user.id, triggerType: "manual" });
    revalidatePath(BASE);
    revalidatePath("/cashflow/dashboard");
    revalidatePath("/cashflow/accounts");
    revalidatePath("/cashflow/transactions");
    if (result.status === "failed") {
      redirect(`${BASE}?error=${encodeURIComponent(result.errorMessage ?? "Sync gagal")}`);
    }
    redirect(`${BASE}?synced=${result.batchId}`);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // let Next.js redirect() through
    const message = err instanceof Error ? err.message : "Sync gagal karena error tidak diketahui";
    redirect(`${BASE}?error=${encodeURIComponent(message)}`);
  }
}

export async function saveSyncConfig(formData: FormData) {
  const supabase = await createClient();
  const { user, canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) redirect(`${BASE}?error=${encodeURIComponent("Anda tidak memiliki akses.")}`);

  const spreadsheetId = (formData.get("spreadsheet_id") as string).trim();
  const sheetName = (formData.get("sheet_name") as string).trim();
  const polarity = formData.get("debit_credit_polarity") as string;
  const staleHours = formData.get("stale_sync_hours") as string;

  await Promise.all([
    supabase.from("sync_config").upsert({ key: "spreadsheet_id", value: JSON.stringify(spreadsheetId), updated_by: user.id }),
    supabase.from("sync_config").upsert({ key: "sheet_name", value: JSON.stringify(sheetName), updated_by: user.id }),
    supabase.from("sync_config").upsert({ key: "debit_credit_polarity", value: JSON.stringify(polarity), updated_by: user.id }),
    supabase.from("sync_config").upsert({ key: "stale_sync_hours", value: staleHours, updated_by: user.id }),
  ]);

  revalidatePath(BASE);
  redirect(BASE);
}

export async function resolveSyncError(formData: FormData) {
  const supabase = await createClient();
  const { user, canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) redirect(`${BASE}?error=${encodeURIComponent("Anda tidak memiliki akses.")}`);

  const id = formData.get("id") as string;
  const status = formData.get("next_status") as "resolved" | "ignored";
  await supabase.from("sync_errors").update({ status, resolved_by: user.id, resolved_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(BASE);
  redirect(BASE);
}
