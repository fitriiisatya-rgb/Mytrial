import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { inputClass } from "@/components/master-data/form-field";
import { fromSen, toSen } from "@/lib/money";

/**
 * Spec S — Trial Balance: per-account opening/period/ending Dr and Cr
 * columns (not a single net figure like the GL's ending balance), so
 * the fundamental double-entry identity — total ending debit equals
 * total ending credit — is directly visible as two column footers
 * rather than asserted in prose. Same posted-only, normal_balance-aware
 * source as the General Ledger page.
 */
export default async function TrialBalancePage({ searchParams }: { searchParams: { error?: string; entity_id?: string; period_id?: string } }) {
  const { error, entity_id, period_id } = searchParams;
  const supabase = await createClient();

  const [{ data: entities }, { data: coaList }] = await Promise.all([
    supabase.from("entities").select("id, name").eq("active", true).order("name"),
    supabase.from("coa").select("id, code, name, normal_balance").eq("active", true).order("code"),
  ]);

  const effectiveEntityId = entity_id || entities?.[0]?.id;
  const { data: periods } = effectiveEntityId
    ? await supabase.from("accounting_periods").select("id, period_month, period_year").eq("entity_id", effectiveEntityId).order("period_year", { ascending: false }).order("period_month", { ascending: false })
    : { data: [] };
  const effectivePeriodId = period_id || periods?.[0]?.id;
  const period = periods?.find((p) => p.id === effectivePeriodId);
  const start = period ? `${period.period_year}-${String(period.period_month).padStart(2, "0")}-01` : "";

  let rows: { debit: string; credit: string; coa_id: string; journal_date: string }[] = [];
  if (effectiveEntityId && period) {
    const endDate = new Date(period.period_year, period.period_month, 0);
    const end = `${period.period_year}-${String(period.period_month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    const { data } = await supabase
      .from("v_posted_journal_lines")
      .select("coa_id, debit, credit, journal_date")
      .eq("entity_id", effectiveEntityId)
      .lte("journal_date", end);
    rows = data ?? [];
  }

  const perCoa = new Map<string, { openingDebit: bigint; openingCredit: bigint; periodDebit: bigint; periodCredit: bigint }>();
  for (const r of rows) {
    const bucket = perCoa.get(r.coa_id) ?? { openingDebit: 0n, openingCredit: 0n, periodDebit: 0n, periodCredit: 0n };
    if (r.journal_date < start) {
      bucket.openingDebit += toSen(r.debit);
      bucket.openingCredit += toSen(r.credit);
    } else {
      bucket.periodDebit += toSen(r.debit);
      bucket.periodCredit += toSen(r.credit);
    }
    perCoa.set(r.coa_id, bucket);
  }

  const tbRows = (coaList ?? [])
    .map((c) => {
      const b = perCoa.get(c.id) ?? { openingDebit: 0n, openingCredit: 0n, periodDebit: 0n, periodCredit: 0n };
      const endingDebitRaw = b.openingDebit + b.periodDebit;
      const endingCreditRaw = b.openingCredit + b.periodCredit;
      // Every account collapses to a single non-negative Dr or Cr figure
      // for the ending column — its own normal side unless the balance
      // genuinely flipped to the opposite side (e.g. an overdrawn cash
      // account), never both at once.
      const net = c.normal_balance === "debit" ? endingDebitRaw - endingCreditRaw : endingCreditRaw - endingDebitRaw;
      const onNormalSide = net >= 0n;
      const endingDebit = c.normal_balance === "debit" ? (onNormalSide ? net : 0n) : onNormalSide ? 0n : -net;
      const endingCredit = c.normal_balance === "credit" ? (onNormalSide ? net : 0n) : onNormalSide ? 0n : -net;
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        openingDebit: b.openingDebit,
        openingCredit: b.openingCredit,
        periodDebit: b.periodDebit,
        periodCredit: b.periodCredit,
        endingDebit,
        endingCredit,
      };
    })
    .filter((r) => r.openingDebit || r.openingCredit || r.periodDebit || r.periodCredit);

  const totalEndingDebit = tbRows.reduce((s, r) => s + r.endingDebit, 0n);
  const totalEndingCredit = tbRows.reduce((s, r) => s + r.endingCredit, 0n);

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader title="Trial Balance" description="Total saldo akhir debit harus tepat sama dengan total saldo akhir kredit — konsekuensi langsung dari setiap jurnal posted yang balanced." />

      <form className="bg-white border border-border rounded-lg p-4 mb-4 flex gap-3" method="get">
        <select name="entity_id" defaultValue={effectiveEntityId} className={inputClass}>
          {entities?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select name="period_id" defaultValue={effectivePeriodId} className={inputClass}>
          {periods?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.period_month}/{p.period_year}
            </option>
          ))}
        </select>
        <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
          Terapkan
        </button>
      </form>

      <DataTable
        emptyMessage="Tidak ada aktivitas posted untuk periode ini."
        columns={[
          { header: "COA", cell: (r) => `${r.code} — ${r.name}` },
          { header: "Awal Debit", align: "right", cell: (r) => fromSen(r.openingDebit) },
          { header: "Awal Kredit", align: "right", cell: (r) => fromSen(r.openingCredit) },
          { header: "Periode Debit", align: "right", cell: (r) => fromSen(r.periodDebit) },
          { header: "Periode Kredit", align: "right", cell: (r) => fromSen(r.periodCredit) },
          { header: "Akhir Debit", align: "right", cell: (r) => fromSen(r.endingDebit) },
          { header: "Akhir Kredit", align: "right", cell: (r) => fromSen(r.endingCredit) },
        ]}
        rows={tbRows}
      />

      <div className="mt-3 bg-white border border-border rounded-lg p-4 flex justify-between text-sm font-semibold">
        <span>Total Akhir</span>
        <span className={totalEndingDebit === totalEndingCredit ? "text-green-700" : "text-red-700"}>
          Debit {fromSen(totalEndingDebit)} — Kredit {fromSen(totalEndingCredit)} — Selisih {fromSen(totalEndingDebit - totalEndingCredit)}
        </span>
      </div>
    </div>
  );
}
