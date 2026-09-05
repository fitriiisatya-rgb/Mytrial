import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { todayJakarta, addDaysISO } from "./format";

type DB = SupabaseClient<Database>;
type AlertInsert = Database["public"]["Tables"]["cashflow_alerts"]["Insert"];

/** Insert an alert only if no OPEN alert with the same dedupe_key already exists — this is the anti-spam guarantee (RULE: "Jangan spam alert duplicate"). */
async function raiseAlert(supabase: DB, alert: AlertInsert): Promise<void> {
  const { data: existing } = await supabase
    .from("cashflow_alerts")
    .select("id")
    .eq("dedupe_key", alert.dedupe_key)
    .eq("status", "OPEN")
    .maybeSingle();
  if (existing) return;
  await supabase.from("cashflow_alerts").insert(alert);
}

export async function evaluateAlerts(supabase: DB): Promise<void> {
  const today = todayJakarta();
  const { data: rules } = await supabase.from("alert_rules").select("*").eq("is_active", true);
  if (!rules?.length) return;

  const { data: balances } = await supabase.from("v_bank_account_balance").select("*").eq("is_active", true);
  const { data: plans } = await supabase
    .from("planned_cashflows")
    .select("bank_account_id, type, amount, plan_date")
    .in("status", ["PLANNED", "APPROVED"])
    .lte("plan_date", addDaysISO(today, 30));

  for (const rule of rules) {
    const targetAccounts = rule.bank_account_id
      ? (balances ?? []).filter((b) => b.bank_account_id === rule.bank_account_id)
      : (balances ?? []);

    if (rule.alert_type === "LOW_BALANCE" && rule.threshold_amount != null) {
      for (const b of targetAccounts) {
        if (Number(b.current_balance) < Number(rule.threshold_amount)) {
          await raiseAlert(supabase, {
            alert_rule_id: rule.id,
            alert_type: "LOW_BALANCE",
            bank_account_id: b.bank_account_id,
            severity: "WARNING",
            message: `Saldo ${b.account_name} di bawah ambang batas (Rp ${Number(rule.threshold_amount).toLocaleString("id-ID")}).`,
            related_date: today,
            related_amount: b.current_balance,
            dedupe_key: `LOW_BALANCE:${b.bank_account_id}:${today}`,
          });
        }
      }
    }

    if (rule.alert_type === "NEGATIVE_PROJECTED_BALANCE") {
      for (const b of targetAccounts) {
        const accountPlans = (plans ?? []).filter((p) => p.bank_account_id === b.bank_account_id);
        const upcomingIn = accountPlans.filter((p) => p.type === "CASH_IN").reduce((s, p) => s + Number(p.amount), 0);
        const upcomingOut = accountPlans.filter((p) => p.type === "CASH_OUT").reduce((s, p) => s + Number(p.amount), 0);
        const projected = Number(b.current_balance) + upcomingIn - upcomingOut;
        if (projected < 0) {
          await raiseAlert(supabase, {
            alert_rule_id: rule.id,
            alert_type: "NEGATIVE_PROJECTED_BALANCE",
            bank_account_id: b.bank_account_id,
            severity: "CRITICAL",
            message: `Proyeksi saldo ${b.account_name} 30 hari ke depan negatif (Rp ${projected.toLocaleString("id-ID")}).`,
            related_date: addDaysISO(today, 30),
            related_amount: String(projected),
            dedupe_key: `NEGATIVE_PROJECTED_BALANCE:${b.bank_account_id}:${today}`,
          });
        }
      }
    }

    if (rule.alert_type === "LARGE_PAYMENT" && rule.threshold_amount != null) {
      const { data: largePayments } = await supabase
        .from("payment_schedules")
        .select("id, payee, amount, due_date, bank_account_id")
        .in("status", ["SCHEDULED", "APPROVED"])
        .gte("amount", rule.threshold_amount)
        .gte("due_date", today);
      for (const p of largePayments ?? []) {
        await raiseAlert(supabase, {
          alert_rule_id: rule.id,
          alert_type: "LARGE_PAYMENT",
          bank_account_id: p.bank_account_id,
          severity: "WARNING",
          message: `Pembayaran besar ke ${p.payee} sebesar Rp ${Number(p.amount).toLocaleString("id-ID")} jatuh tempo ${p.due_date}.`,
          related_date: p.due_date,
          related_amount: p.amount,
          dedupe_key: `LARGE_PAYMENT:${p.id}`,
        });
      }
    }

    if (rule.alert_type === "RECONCILIATION_DIFFERENCE") {
      const { data: diffs } = await supabase
        .from("account_balance_snapshots")
        .select("bank_account_id, snapshot_date, closing_balance, source_balance")
        .eq("reconciliation_status", "DIFFERENCE")
        .gte("snapshot_date", addDaysISO(today, -14));
      for (const d of diffs ?? []) {
        const diff = Number(d.source_balance) - Number(d.closing_balance);
        await raiseAlert(supabase, {
          alert_rule_id: rule.id,
          alert_type: "RECONCILIATION_DIFFERENCE",
          bank_account_id: d.bank_account_id,
          severity: "WARNING",
          message: `Selisih saldo pada ${d.snapshot_date}: sistem Rp ${Number(d.closing_balance).toLocaleString("id-ID")} vs spreadsheet Rp ${Number(d.source_balance).toLocaleString("id-ID")} (selisih Rp ${diff.toLocaleString("id-ID")}).`,
          related_date: d.snapshot_date,
          related_amount: String(diff),
          dedupe_key: `RECONCILIATION_DIFFERENCE:${d.bank_account_id}:${d.snapshot_date}`,
        });
      }
    }

    if (rule.alert_type === "STALE_SYNC" && rule.threshold_hours != null) {
      const { data: lastBatch } = await supabase
        .from("sync_batches")
        .select("finished_at")
        .eq("status", "completed")
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastSync = lastBatch?.finished_at ? new Date(lastBatch.finished_at) : null;
      const hoursSince = lastSync ? (Date.now() - lastSync.getTime()) / 3600000 : Infinity;
      if (hoursSince > rule.threshold_hours) {
        await raiseAlert(supabase, {
          alert_rule_id: rule.id,
          alert_type: "STALE_SYNC",
          bank_account_id: null,
          severity: "CRITICAL",
          message: lastSync
            ? `Google Sheet belum disinkronkan selama ${Math.floor(hoursSince)} jam.`
            : "Belum pernah ada sinkronisasi Google Sheet yang berhasil.",
          related_date: today,
          dedupe_key: `STALE_SYNC:${today}`,
        });
      }
    }
  }
}
