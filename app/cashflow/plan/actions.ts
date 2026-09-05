"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import type { PlannedCashflowStatus } from "@/types/database.types";

const BASE = "/cashflow/plan";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

export async function createPlan(formData: FormData) {
  const supabase = await createClient();
  const { user, canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses.");

  const { error } = await supabase.from("planned_cashflows").insert({
    plan_date: formData.get("plan_date") as string,
    bank_account_id: formData.get("bank_account_id") as string,
    type: formData.get("type") as "CASH_IN" | "CASH_OUT",
    category_id: (formData.get("category_id") as string) || null,
    description: (formData.get("description") as string) || null,
    amount: formData.get("amount") as string,
    is_recurring: formData.get("is_recurring") === "on",
    notes: (formData.get("notes") as string) || null,
    created_by: user.id,
  });

  revalidatePath(BASE);
  revalidatePath("/cashflow/dashboard");
  if (error) fail(error.message);
  redirect(BASE);
}

export async function updatePlanStatus(formData: FormData) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses.");

  const id = formData.get("id") as string;
  const status = formData.get("status") as PlannedCashflowStatus;
  // RULE 9: this only updates the plan row itself — it never touches or
  // overwrites a historical actual cashflow_transactions row.
  const { error } = await supabase.from("planned_cashflows").update({ status }).eq("id", id);

  revalidatePath(BASE);
  revalidatePath("/cashflow/dashboard");
  if (error) fail(error.message);
  redirect(BASE);
}

export async function deletePlan(formData: FormData) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses.");

  const id = formData.get("id") as string;
  const { error } = await supabase.from("planned_cashflows").delete().eq("id", id).eq("status", "PLANNED");
  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}
