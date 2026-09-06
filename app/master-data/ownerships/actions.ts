"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";

const BASE = "/master-data/ownerships";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

/**
 * Ownership is effective-dated (Correction #4) — this is deliberately
 * insert-only. Changing who owns what is never an UPDATE on an existing
 * row's percentage/dates (that would silently rewrite history); it is
 * always a new row with its own start_date. See endOwnership() for the
 * one field that IS mutable on an existing row: closing its end_date.
 */
export async function createOwnership(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const endDate = str(formData, "end_date");
  const row = {
    investor_id: formData.get("investor_id") as string,
    outlet_id: formData.get("outlet_id") as string,
    contract_id: formData.get("contract_id") as string,
    ownership_pct: str(formData, "ownership_pct")!,
    investment_amount: str(formData, "investment_amount") ?? "0",
    start_date: formData.get("start_date") as string,
    end_date: endDate,
    active: true,
    created_by: user.id,
  };

  const { data, error } = await supabase.from("investor_ownerships").insert(row).select("id").single();

  if (error) {
    // fn_check_ownership_total (0002) is the real guard — this is only a
    // clearer restatement of its message for a non-technical user.
    if (error.message.includes("exceeding 100 percent")) {
      fail(`Total kepemilikan outlet ini akan melebihi 100% pada rentang tanggal yang tumpang tindih. ${error.message}`);
    }
    fail(error.message);
  }
  await logAudit(supabase, {
    userId: user.id,
    action: "ownership_created",
    entityTable: "investor_ownerships",
    entityId: data.id,
    newValue: row,
  });

  revalidatePath(BASE);
  redirect(BASE);
}

/** Closes an ownership row's effective period going forward. Also flips
 * `active` off — the portal's own outlet-visibility check
 * (auth_accessible_outlets(), 0002) reads `active`, not the date range, so
 * ending a row without deactivating it would leave the investor with
 * portal access to an outlet whose ownership already ended. */
export async function endOwnership(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string;
  const endDate = formData.get("end_date") as string;

  const { error } = await supabase.from("investor_ownerships").update({ end_date: endDate, active: false }).eq("id", id);
  if (error) fail(error.message);
  await logAudit(supabase, {
    userId: user.id,
    action: "ownership_ended",
    entityTable: "investor_ownerships",
    entityId: id,
    newValue: { end_date: endDate, active: false },
  });

  revalidatePath(BASE);
  redirect(BASE);
}

export async function toggleOwnershipActive(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("investor_ownerships").update({ active: !active }).eq("id", id);
  if (error) fail(error.message);
  await logAudit(supabase, {
    userId: user.id,
    action: active ? "ownership_deactivated" : "ownership_activated",
    entityTable: "investor_ownerships",
    entityId: id,
    newValue: { active: !active },
  });

  revalidatePath(BASE);
  redirect(BASE);
}
