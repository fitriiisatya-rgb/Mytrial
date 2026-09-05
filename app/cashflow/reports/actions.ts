"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";

const BASE = "/cashflow/reports?tab=transfers";

function fail(message: string): never {
  redirect(`${BASE}&error=${encodeURIComponent(message)}`);
}

/** User confirms a suggested internal transfer match — only now does it stop counting as external cashflow (RULE 3). */
export async function confirmInternalTransfer(formData: FormData) {
  const supabase = await createClient();
  const { user, canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses.");

  const id = formData.get("id") as string;
  const { data: transfer, error: fetchError } = await supabase.from("internal_transfers").select("*").eq("id", id).single();
  if (fetchError || !transfer) fail(fetchError?.message ?? "Transfer tidak ditemukan");

  const { error: updateTransferError } = await supabase
    .from("internal_transfers")
    .update({ status: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateTransferError) fail(updateTransferError.message);

  if (transfer.from_transaction_id) {
    await supabase
      .from("cashflow_transactions")
      .update({ transaction_type: "INTERNAL_TRANSFER_OUT", internal_transfer_id: id })
      .eq("id", transfer.from_transaction_id);
  }
  if (transfer.to_transaction_id) {
    await supabase
      .from("cashflow_transactions")
      .update({ transaction_type: "INTERNAL_TRANSFER_IN", internal_transfer_id: id })
      .eq("id", transfer.to_transaction_id);
  }

  revalidatePath("/cashflow/reports");
  revalidatePath("/cashflow/dashboard");
  revalidatePath("/cashflow/transactions");
  redirect(BASE);
}

export async function rejectInternalTransfer(formData: FormData) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  if (!canWrite) fail("Anda tidak memiliki akses.");

  const id = formData.get("id") as string;
  const { error } = await supabase.from("internal_transfers").update({ status: "rejected" }).eq("id", id);
  revalidatePath("/cashflow/reports");
  if (error) fail(error.message);
  redirect(BASE);
}
