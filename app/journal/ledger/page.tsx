import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { inputClass } from "@/components/master-data/form-field";
import { fromSen, toSen } from "@/lib/money";

/**
 * Spec Q/R — General Ledger, built exclusively from v_posted_journal_lines
 * (0005) — draft/reviewed/approved-but-not-posted journals never appear
 * here by construction (the view itself filters status='posted'), so
 * there is no separate "only posted" filter to remember to apply.
 * Opening balance = everything posted before the period start; ending =
 * opening + period activity, signed per the account's own normal_balance
 * (spec R — never hardcoded by account_type, read from coa.normal_balance
 * directly).
 */
export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: { error?: string; entity_id?: string; period_id?: string; outlet_id?: string; coa_id?: string; bank_account_id?: string; source_type?: string };
}) {
  const { error, entity_id, period_id, outlet_id, coa_id, bank_account_id, source_type } = searchParams;
  const supabase = await createClient();

  const [{ data: entities }, { data: outlets }, { data: coaList }, { data: banks }] = await Promise.all([
    supabase.from("entities").select("id, name").eq("active", true).order("name"),
    supabase.from("outlets").select("id, outlet_name").eq("active", true).order("outlet_name"),
    supabase.from("coa").select("id, code, name, normal_balance").eq("active", true).order("code"),
    supabase.from("banks").select("id, bank_name").eq("active", true).order("bank_name"),
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

    let query = supabase.from("v_posted_journal_lines").select("coa_id, debit, credit, journal_date, outlet_id, bank_account_id, source_type").eq("entity_id", effectiveEntityId);
    if (outlet_id) query = query.eq("outlet_id", outlet_id);
    if (coa_id) query = query.eq("coa_id", coa_id);
    if (bank_account_id) query = query.eq("bank_account_id", bank_account_id);
    if (source_type) query = query.eq("source_type", source_type as never);
    query = query.lte("journal_date", end);

    const { data } = await query;
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

  const glRows = (coaList ?? [])
    .map((c) => {
      const b = perCoa.get(c.id) ?? { openingDebit: 0n, openingCredit: 0n, periodDebit: 0n, periodCredit: 0n };
      const sign = c.normal_balance === "debit" ? 1n : -1n;
      const openingBalance = sign * (b.openingDebit - b.openingCredit);
      const endingBalance = sign * (b.openingDebit + b.periodDebit - (b.openingCredit + b.periodCredit));
      return { id: c.id, code: c.code, name: c.name, normalBalance: c.normal_balance, openingBalance, periodDebit: b.periodDebit, periodCredit: b.periodCredit, endingBalance };
    })
    .filter((r) => r.openingBalance !== 0n || r.periodDebit !== 0n || r.periodCredit !== 0n);

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader title="General Ledger" description="Hanya baris jurnal berstatus Posted yang muncul di sini (v_posted_journal_lines)." />

      <form className="bg-white border border-border rounded-lg p-4 mb-4 grid grid-cols-3 gap-3" method="get">
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
        <select name="outlet_id" defaultValue={outlet_id ?? ""} className={inputClass}>
          <option value="">Semua Outlet</option>
          {outlets?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.outlet_name}
            </option>
          ))}
        </select>
        <select name="coa_id" defaultValue={coa_id ?? ""} className={inputClass}>
          <option value="">Semua COA</option>
          {coaList?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        <select name="bank_account_id" defaultValue={bank_account_id ?? ""} className={inputClass}>
          <option value="">Semua Bank</option>
          {banks?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name}
            </option>
          ))}
        </select>
        <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
          Terapkan
        </button>
      </form>

      <DataTable
        emptyMessage="Tidak ada aktivitas posted untuk filter ini."
        columns={[
          { header: "COA", cell: (r) => <Link href={`/journal/ledger?entity_id=${effectiveEntityId}&period_id=${effectivePeriodId}&coa_id=${r.id}`} className="text-navy underline">{r.code} — {r.name}</Link> },
          { header: "Saldo Awal", align: "right", cell: (r) => fromSen(r.openingBalance) },
          { header: "Debit Periode", align: "right", cell: (r) => fromSen(r.periodDebit) },
          { header: "Kredit Periode", align: "right", cell: (r) => fromSen(r.periodCredit) },
          { header: "Saldo Akhir", align: "right", cell: (r) => fromSen(r.endingBalance) },
        ]}
        rows={glRows}
      />
    </div>
  );
}
