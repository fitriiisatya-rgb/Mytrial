import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { inputClass } from "@/components/master-data/form-field";
import { reprocessMapping } from "./actions";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-navy mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

const TYPE_LABELS: Record<string, string> = {
  outlet_not_detected: "Outlet tidak terdeteksi",
  coa_not_detected: "COA tidak terdeteksi",
  unknown_classification: "Klasifikasi belum dikonfigurasi",
  ambiguous_mapping: "Ambiguous mapping",
  interbank_transfer: "Interbank/interunit candidate",
  shared_cost_candidate: "Shared cost candidate",
  bank_not_found: "Bank tidak dikenali (Phase 3)",
  invalid_amount: "Nominal tidak valid (Phase 3)",
  malformed_data: "Data tidak sesuai format (Phase 3)",
  duplicate_suspected: "Diduga duplikat (Phase 3)",
};

export default async function MappingDashboardPage({ searchParams }: { searchParams: { error?: string; reprocessed?: string } }) {
  const { error, reprocessed } = searchParams;
  const supabase = await createClient();

  const [totalRes, outletMappedRes, coaMappedRes, fullyMappedRes] = await Promise.all([
    supabase.from("bank_transactions_raw").select("id", { count: "exact", head: true }).gt("credit", 0).not("bank_id", "is", null),
    supabase
      .from("bank_transactions_raw")
      .select("id", { count: "exact", head: true })
      .gt("credit", 0)
      .not("bank_id", "is", null)
      .not("detected_outlet_id", "is", null),
    supabase
      .from("bank_transactions_raw")
      .select("id", { count: "exact", head: true })
      .gt("credit", 0)
      .not("bank_id", "is", null)
      .not("detected_coa_id", "is", null),
    supabase
      .from("bank_transactions_raw")
      .select("id", { count: "exact", head: true })
      .gt("credit", 0)
      .not("bank_id", "is", null)
      .is("exception_status", null)
      .not("mapped_at", "is", null),
  ]);
  const totalExpenseCandidates = totalRes.count ?? 0;
  const outletMapped = outletMappedRes.count ?? 0;
  const coaMapped = coaMappedRes.count ?? 0;
  const fullyMapped = fullyMappedRes.count ?? 0;

  const [{ data: openExceptions }, { data: matchedOutletRuleRows }, { data: matchedCoaRuleRows }, { data: outletRules }, { data: coaRules }] =
    await Promise.all([
      supabase.from("exceptions").select("exception_type").eq("source_table", "bank_transactions_raw").eq("status", "open"),
      supabase.from("bank_transactions_raw").select("matched_outlet_rule_id").not("matched_outlet_rule_id", "is", null),
      supabase.from("bank_transactions_raw").select("matched_coa_rule_id").not("matched_coa_rule_id", "is", null),
      supabase.from("outlet_mapping_rules").select("id, classification, unit_value, output_outlet_id, outlets(outlet_name)"),
      supabase.from("coa_mapping_rules").select("id, classification, description_keyword, coa!coa_mapping_rules_result_coa_id_fkey(code, name)"),
    ]);

  const exceptionCounts = new Map<string, number>();
  for (const e of openExceptions ?? []) exceptionCounts.set(e.exception_type, (exceptionCounts.get(e.exception_type) ?? 0) + 1);

  const outletRuleHits = new Map<string, number>();
  for (const r of matchedOutletRuleRows ?? []) {
    if (r.matched_outlet_rule_id) outletRuleHits.set(r.matched_outlet_rule_id, (outletRuleHits.get(r.matched_outlet_rule_id) ?? 0) + 1);
  }
  const coaRuleHits = new Map<string, number>();
  for (const r of matchedCoaRuleRows ?? []) {
    if (r.matched_coa_rule_id) coaRuleHits.set(r.matched_coa_rule_id, (coaRuleHits.get(r.matched_coa_rule_id) ?? 0) + 1);
  }

  const outletRuleMetrics = (outletRules ?? [])
    .map((r) => ({ ...r, hits: outletRuleHits.get(r.id) ?? 0 }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 10);
  const coaRuleMetrics = (coaRules ?? [])
    .map((r) => ({ ...r, hits: coaRuleHits.get(r.id) ?? 0 }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 10);

  const [{ data: entities }, { data: batches }, { data: recentRuns }] = await Promise.all([
    supabase.from("entities").select("id, name").eq("active", true).order("name"),
    supabase.from("import_batches").select("id, source_name, imported_at").order("imported_at", { ascending: false }).limit(20),
    supabase.from("mapping_runs").select("*").order("started_at", { ascending: false }).limit(10),
  ]);

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      {reprocessed !== undefined && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Reprocess selesai — {reprocessed} baris diproses ulang. Lihat Exception Center untuk hasilnya.
        </div>
      )}
      <PageHeader
        title="Mapping Dashboard"
        description="Coverage outlet/COA mapping, exception terbuka per jenis, dan rule mana yang paling sering (atau tidak pernah) cocok."
      />

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Kandidat Pengeluaran" value={String(totalExpenseCandidates)} sub="Kredit > 0, bank dikenali" />
        <StatCard label="Outlet Terpetakan" value={pct(outletMapped, totalExpenseCandidates)} sub={`${outletMapped} / ${totalExpenseCandidates}`} />
        <StatCard label="COA Terpetakan" value={pct(coaMapped, totalExpenseCandidates)} sub={`${coaMapped} / ${totalExpenseCandidates}`} />
        <StatCard label="Terpetakan Bersih (Tanpa Exception)" value={pct(fullyMapped, totalExpenseCandidates)} sub={`${fullyMapped} / ${totalExpenseCandidates}`} />
      </div>

      <section>
        <h2 className="text-base font-semibold text-navy mb-2">Exception Terbuka per Jenis</h2>
        <div className="bg-white border border-border rounded-lg p-4 grid grid-cols-3 gap-3">
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <div key={key} className="flex justify-between text-sm border-b border-border/50 py-1">
              <span className="text-gray-600">{label}</span>
              <span className="font-semibold">{exceptionCounts.get(key) ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-base font-semibold text-navy mb-2">Outlet Rule — Hit Count</h2>
          <DataTable
            emptyMessage="Belum ada rule outlet."
            columns={[
              { header: "Rule", cell: (r) => `${r.classification ?? r.unit_value ?? "(wildcard)"} → ${r.outlets?.outlet_name ?? "—"}` },
              { header: "Hits", align: "right", cell: (r) => r.hits },
            ]}
            rows={outletRuleMetrics}
          />
        </div>
        <div>
          <h2 className="text-base font-semibold text-navy mb-2">COA Rule — Hit Count</h2>
          <DataTable
            emptyMessage="Belum ada rule COA."
            columns={[
              { header: "Rule", cell: (r) => `${r.classification ?? r.description_keyword ?? "(wildcard)"} → ${r.coa?.code ?? "—"}` },
              { header: "Hits", align: "right", cell: (r) => r.hits },
            ]}
            rows={coaRuleMetrics}
          />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-2">Reprocess Engine</h2>
        <p className="text-xs text-gray-500 mb-2">
          Jalankan ulang mapping engine terhadap baris yang masih open (belum pernah dipetakan, atau exception yang dibuat oleh mapping engine sendiri) — misalnya setelah menambah rule baru. Baris yang sudah diselesaikan atau diabaikan manusia tidak pernah disentuh ulang.
        </p>
        <form action={reprocessMapping} className="bg-white border border-border rounded-lg p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cakupan</label>
            <select name="scope" className={inputClass} defaultValue="batch">
              <option value="batch">Satu Batch Import</option>
              <option value="entity">Seluruh Entitas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Batch (jika cakupan = batch)</label>
            <select name="scope_id" className={inputClass}>
              <option value="">Pilih…</option>
              {batches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.source_name ?? b.id} — {new Date(b.imported_at).toLocaleString("id-ID")}
                </option>
              ))}
              {entities?.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  [Entitas] {ent.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
            Jalankan Reprocess
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-2">Riwayat Mapping Run</h2>
        <DataTable
          emptyMessage="Belum ada mapping run."
          columns={[
            { header: "Waktu", cell: (r) => new Date(r.started_at).toLocaleString("id-ID") },
            { header: "Trigger", cell: (r) => (r.trigger === "post_import" ? "Otomatis (setelah import)" : "Manual") },
            { header: "Cakupan", cell: (r) => r.scope },
            { header: "Discan", align: "right", cell: (r) => r.rows_scanned },
            { header: "Outlet OK", align: "right", cell: (r) => r.rows_outlet_mapped },
            { header: "COA OK", align: "right", cell: (r) => r.rows_coa_mapped },
            { header: "Ambiguous", align: "right", cell: (r) => r.rows_ambiguous },
            { header: "Interbank", align: "right", cell: (r) => r.rows_interbank_candidate },
            { header: "Shared Cost", align: "right", cell: (r) => r.rows_shared_cost_candidate },
            { header: "Exception Baru", align: "right", cell: (r) => r.rows_exceptions_created },
            { header: "Auto-resolved", align: "right", cell: (r) => r.rows_exceptions_autoresolved },
          ]}
          rows={recentRuns ?? []}
        />
      </section>
    </div>
  );
}
