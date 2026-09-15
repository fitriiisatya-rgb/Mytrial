import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { inputClass } from "@/components/master-data/form-field";
import { generateSharedCostAllocation } from "../actions";

/**
 * Spec F — Shared Cost. A row flagged is_shared_cost_candidate by the
 * Phase 4 Mapping Engine never gets posted to one outlet automatically
 * — it waits here ("waiting_allocation") until a human picks which
 * outlets share it (equal split if every weight is left blank, or a
 * percentage split otherwise) and generates the balanced allocation
 * journal (lib/journal/build-shared-cost-journal.ts, backed by
 * lib/money.ts's allocateProportionally/allocateEqually).
 */
export default async function SharedCostPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("bank_transactions_raw")
    .select("id, bank_label_raw, txn_date, classification_raw, description_raw, credit, bank_id, banks(entity_id)")
    .eq("is_shared_cost_candidate", true)
    .eq("processed", false);

  const { data: coa } = await supabase.from("coa").select("id, code, name").eq("active", true).eq("account_type", "operating_expense").order("code");
  const { data: outlets } = await supabase.from("outlets").select("id, outlet_name").eq("active", true).order("outlet_name");

  return (
    <div className="space-y-6">
      <ErrorBanner message={searchParams.error} />
      <PageHeader
        title="Shared Cost — Waiting Allocation"
        description="Biaya bersama lintas outlet menunggu alokasi manual sebelum jurnal dibuat. Total debit hasil alokasi selalu tepat sama dengan total kredit (largest-remainder method, tidak ada sisa pembulatan yang hilang)."
      />

      {(rows ?? []).length === 0 && <p className="text-sm text-gray-500">Tidak ada transaksi yang menunggu alokasi.</p>}

      {(rows ?? []).map((row) => (
        <form key={row.id} action={generateSharedCostAllocation} className="bg-white border border-border rounded-lg p-4 space-y-3">
          <input type="hidden" name="bank_transaction_id" value={row.id} />
          <input type="hidden" name="entity_id" value={row.banks?.entity_id ?? ""} />
          <div className="flex justify-between text-sm">
            <div>
              <div className="font-medium">{row.bank_label_raw}</div>
              <div className="text-gray-500 text-xs">
                {row.txn_date} · {row.classification_raw} · {row.description_raw}
              </div>
            </div>
            <div className="font-semibold">Rp {row.credit}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">COA Beban</label>
              <select name="expense_coa_id" required className={inputClass}>
                <option value="">Pilih COA…</option>
                {coa?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Bagikan ke Outlet (kosongkan semua % untuk split rata)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {outlets?.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm border border-border rounded-lg px-2 py-1">
                  <input type="checkbox" name="outlet_id" value={o.id} className="shrink-0" />
                  <span className="flex-1">{o.outlet_name}</span>
                  <input type="number" name={`weight_${o.id}`} placeholder="%" className="w-16 border border-border rounded px-1 py-0.5 text-xs" />
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
            Generate Jurnal Alokasi
          </button>
        </form>
      ))}
    </div>
  );
}
