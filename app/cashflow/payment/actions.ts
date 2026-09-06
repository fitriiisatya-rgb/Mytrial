"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import type { PaymentPriority, PaymentScheduleStatus } from "@/types/database.types";

const BASE = "/cashflow/payment";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

export async function createPaymentSchedule(formData: FormData) {
  const supabase = await createClient();
  const { user, canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses.");

  const { error } = await supabase.from("payment_schedules").insert({
    due_date: formData.get("due_date") as string,
    bank_account_id: (formData.get("bank_account_id") as string) || null,
    payee: formData.get("payee") as string,
    description: (formData.get("description") as string) || null,
    category_id: (formData.get("category_id") as string) || null,
    amount: formData.get("amount") as string,
    priority: formData.get("priority") as PaymentPriority,
    created_by: user.id,
  });

  revalidatePath(BASE);
  if (error) fail(error.message);
  redirect(BASE);
}

export async function updatePaymentStatus(formData: FormData) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses.");

  const id = formData.get("id") as string;
  const status = formData.get("status") as PaymentScheduleStatus;
  const { error } = await supabase.from("payment_schedules").update({ status }).eq("id", id);

  revalidatePath(BASE);
  revalidatePath("/cashflow/dashboard");
  if (error) fail(error.message);
  redirect(BASE);
}
