"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/supabase/audit";

const BASE = "/master-data/coa";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

/**
 * The schema doesn't forbid a cyclical parent chain at the DB level, so
 * this guards it here: a COA row can never be its own ancestor. Walks up
 * from the proposed parent; if it ever reaches `id`, the assignment
 * would create a cycle.
 */
async function wouldCreateCycle(
  supabase: SupabaseClient<Database>,
  id: string,
  parentId: string
): Promise<boolean> {
  let current: string | null = parentId;
  const visited = new Set<string>();
  while (current) {
    const cursor: string = current;
    if (cursor === id) return true;
    if (visited.has(cursor)) return true; // pre-existing cycle, refuse to extend it
    visited.add(cursor);
    const result = await supabase.from("coa").select("parent_id").eq("id", cursor).single();
    current = result.data?.parent_id ?? null;
  }
  return false;
}

export async function saveCoa(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string | null;
  const parentId = str(formData, "parent_id");

  if (parentId && id && parentId === id) {
    fail("Akun COA tidak boleh menjadi induk dari dirinya sendiri.");
  }
  if (parentId && id && (await wouldCreateCycle(supabase, id, parentId))) {
    fail("Akun induk yang dipilih akan membuat hierarki melingkar (circular).");
  }

  const row = {
    code: str(formData, "code")!,
    name: str(formData, "name")!,
    account_type: formData.get("account_type") as
      | "asset" | "liability" | "equity" | "revenue" | "cogs"
      | "operating_expense" | "other_income" | "other_expense",
    normal_balance: formData.get("normal_balance") as "debit" | "credit",
    parent_id: parentId,
    pnl_category: str(formData, "pnl_category"),
    reporting_order: Number(formData.get("reporting_order") ?? 0),
    active: formData.get("active") === "on",
  };

  const { data, error } = id
    ? await supabase.from("coa").update(row).eq("id", id).select("id").single()
    : await supabase.from("coa").insert(row).select("id").single();

  if (error) {
    if (error.code === "23505") fail(`Kode akun "${row.code}" sudah digunakan.`);
    fail(error.message);
  }
  await logAudit(supabase, {
    userId: user.id,
    action: id ? "coa_updated" : "coa_created",
    entityTable: "coa",
    entityId: data.id,
    newValue: row,
  });

  revalidatePath(BASE);
  redirect(BASE);
}

export async function toggleCoaActive(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("Sesi berakhir, silakan login kembali.");

  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";

  const { error } = await supabase.from("coa").update({ active: !active }).eq("id", id);
  if (error) fail(error.message);
  await logAudit(supabase, {
    userId: user.id,
    action: active ? "coa_deactivated" : "coa_activated",
    entityTable: "coa",
    entityId: id,
    newValue: { active: !active },
  });

  revalidatePath(BASE);
  redirect(BASE);
}
