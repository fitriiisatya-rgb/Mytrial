import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { toSen } from "@/lib/money";
import { SignOutButton } from "../sign-out-button";

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="bg-white border border-border rounded-lg p-4 hover:border-navy">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-navy mt-1">{value}</div>
    </Link>
  );
}

/**
 * Spec X — accounting dashboard metrics, all pointing at concrete action
 * items: how many transactions are ready to become a journal, where
 * every in-flight journal sits in the workflow, and the two failure
 * signals (a candidate row with no accounting period configured yet,
 * and a non-posted journal whose lines don't balance) that a person
 * needs to go fix, not just a status count.
 */
export default async function AccountingHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();

  const [{ count: readyBankCount }, { count: readyRevenueCount }] = await Promise.all([
    supabase
      .from("bank_transactions_raw")
      .select("id", { count: "exact", head: true })
      .gt("credit", 0)
      .not("bank_id", "is", null)
      .not("detected_coa_id", "is", null)
      .eq("is_interbank_transfer", false)
      .eq("is_shared_cost_candidate", false)
      .eq("processed", false)
      .is("exception_status", null),
    supabase.from("revenue_transactions_raw").select("id", { count: "exact", head: true }).eq("processed", false).not("outlet_id", "is", null),
  ]);
  const readyForJournal = (readyBankCount ?? 0) + (readyRevenueCount ?? 0);

  const [{ count: draftCount }, { count: reviewedCount }, { count: approvedCount }, { count: postedCount }] = await Promise.all([
    supabase.from("journal_headers").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("journal_headers").select("id", { count: "exact", head: true }).eq("status", "reviewed"),
    supabase.from("journal_headers").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("journal_headers").select("id", { count: "exact", head: true }).eq("status", "posted"),
  ]);

  // Failed-generation signal: candidate rows that look ready but have no
  // accounting_period to actually land in yet — generateDraftJournals
  // would report these back as a per-row failure, not silently drop them.
  // Limited to bank rows here (revenue rows don't carry entity_id
  // directly without a join this dashboard-level check doesn't need).
  const [{ data: readyBankDates }, { data: periods }] = await Promise.all([
    supabase
      .from("bank_transactions_raw")
      .select("txn_date, banks(entity_id)")
      .gt("credit", 0)
      .not("bank_id", "is", null)
      .not("detected_coa_id", "is", null)
      .eq("is_interbank_transfer", false)
      .eq("is_shared_cost_candidate", false)
      .eq("processed", false)
      .is("exception_status", null),
    supabase.from("accounting_periods").select("entity_id, period_year, period_month"),
  ]);
  const periodKeys = new Set((periods ?? []).map((p) => `${p.entity_id}|${p.period_year}-${p.period_month}`));
  const failedGeneration = (readyBankDates ?? []).filter((r) => {
    const d = new Date(r.txn_date);
    return !periodKeys.has(`${r.banks?.entity_id}|${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`);
  }).length;

  // Unbalanced signal: a non-posted journal (posted ones are guaranteed
  // balanced by the DB guard) whose lines still don't reconcile.
  const { data: unpostedJournals } = await supabase
    .from("journal_headers")
    .select("id, journal_lines(debit, credit)")
    .in("status", ["draft", "reviewed", "approved"]);
  const unbalancedCount = (unpostedJournals ?? []).filter((j) => {
    const debit = j.journal_lines.reduce((s, l) => s + toSen(l.debit), 0n);
    const credit = j.journal_lines.reduce((s, l) => s + toSen(l.credit), 0n);
    return debit !== credit;
  }).length;

  return (
    <main className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-navy">Action Center — Akuntansi</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Masuk sebagai <b>{profile?.full_name}</b> ({profile?.role}).
      </p>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Siap Dijurnal" value={readyForJournal} href="/journal" />
        <StatCard label="Draft (Menunggu Review)" value={draftCount ?? 0} href="/journal?status=draft" />
        <StatCard label="Menunggu Approval" value={reviewedCount ?? 0} href="/journal?status=reviewed" />
        <StatCard label="Siap Diposting" value={approvedCount ?? 0} href="/journal?status=approved" />
        <StatCard label="Posted" value={postedCount ?? 0} href="/journal?status=posted" />
        <StatCard label="Gagal Dijurnal (Tanpa Periode)" value={failedGeneration} href="/journal" />
        <StatCard label="Jurnal Tidak Balance" value={unbalancedCount} href="/journal" />
      </div>

      <div className="flex gap-4 mt-4">
        <Link href="/master-data" className="text-sm text-navy underline">
          Master Data →
        </Link>
        <Link href="/import" className="text-sm text-navy underline">
          Transaction Import →
        </Link>
        <Link href="/mapping" className="text-sm text-navy underline">
          Mapping Engine →
        </Link>
        <Link href="/journal" className="text-sm text-navy underline">
          Auto Journal →
        </Link>
      </div>
      <p className="text-sm text-gray-400 mt-4">P&L dan halaman lain di sidebar prototype dibangun di Phase 6.</p>
    </main>
  );
}
