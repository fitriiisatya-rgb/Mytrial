import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type DB = SupabaseClient<Database>;

const TRANSFER_KEYWORDS = ["transfer", "tf ", "tarik", "pindah buku", "pemindahan", "antar rekening", "rtgs", "rtol"];

function looksLikeTransfer(description: string | null): boolean {
  if (!description) return false;
  const lower = description.toLowerCase();
  return TRANSFER_KEYWORDS.some((k) => lower.includes(k));
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

/**
 * Suggest — never auto-confirm — internal transfer pairs among recently
 * synced, not-yet-linked transactions. A human always confirms the match
 * (RULE: "Jangan auto-match secara agresif jika confidence rendah") before
 * it affects consolidated reporting.
 */
export async function suggestInternalTransfers(supabase: DB, touchedAccountIds: string[]): Promise<void> {
  if (touchedAccountIds.length === 0) return;

  const { data: outRows } = await supabase
    .from("cashflow_transactions")
    .select("id, bank_account_id, transaction_date, cash_out, description")
    .is("internal_transfer_id", null)
    .gt("cash_out", 0)
    .order("transaction_date", { ascending: false })
    .limit(500);

  const { data: inRows } = await supabase
    .from("cashflow_transactions")
    .select("id, bank_account_id, transaction_date, cash_in, description")
    .is("internal_transfer_id", null)
    .gt("cash_in", 0)
    .order("transaction_date", { ascending: false })
    .limit(500);

  if (!outRows?.length || !inRows?.length) return;

  const { data: existingLinks } = await supabase
    .from("internal_transfers")
    .select("from_transaction_id, to_transaction_id");
  const alreadyLinked = new Set<string>();
  for (const l of existingLinks ?? []) {
    if (l.from_transaction_id) alreadyLinked.add(l.from_transaction_id);
    if (l.to_transaction_id) alreadyLinked.add(l.to_transaction_id);
  }

  const usedInRowIds = new Set<string>();
  const suggestions: Database["public"]["Tables"]["internal_transfers"]["Insert"][] = [];

  for (const out of outRows) {
    if (alreadyLinked.has(out.id)) continue;
    const match = inRows.find(
      (inRow) =>
        !usedInRowIds.has(inRow.id) &&
        !alreadyLinked.has(inRow.id) &&
        inRow.bank_account_id !== out.bank_account_id &&
        Number(inRow.cash_in) === Number(out.cash_out) &&
        daysBetween(inRow.transaction_date, out.transaction_date) <= 1
    );
    if (!match) continue;

    usedInRowIds.add(match.id);
    const confidence =
      looksLikeTransfer(out.description) && looksLikeTransfer(match.description)
        ? "high"
        : looksLikeTransfer(out.description) || looksLikeTransfer(match.description)
          ? "medium"
          : daysBetween(match.transaction_date, out.transaction_date) === 0
            ? "medium"
            : "low";

    suggestions.push({
      transfer_date: out.transaction_date,
      amount: out.cash_out,
      from_bank_account_id: out.bank_account_id,
      to_bank_account_id: match.bank_account_id,
      from_transaction_id: out.id,
      to_transaction_id: match.id,
      match_confidence: confidence,
      status: "suggested",
    });
  }

  if (suggestions.length > 0) {
    await supabase.from("internal_transfers").insert(suggestions);
  }
}
