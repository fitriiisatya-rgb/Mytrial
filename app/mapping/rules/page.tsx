import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { ActiveBadge } from "@/components/master-data/status-badge";
import { ConfirmSubmitButton } from "@/components/master-data/confirm-submit-button";
import { FormField, inputClass } from "@/components/master-data/form-field";
import { RuleTester } from "@/components/mapping/rule-tester";
import { saveOutletRule, toggleOutletRuleActive, saveCoaRule, toggleCoaRuleActive } from "../actions";

export default async function MappingRulesPage({
  searchParams,
}: {
  searchParams: { error?: string; edit_outlet?: string; edit_coa?: string };
}) {
  const { error, edit_outlet, edit_coa } = searchParams;
  const supabase = await createClient();

  const [{ data: outletRules }, { data: coaRules }, { data: banks }, { data: outlets }, { data: coa }] = await Promise.all([
    supabase.from("outlet_mapping_rules").select("*, banks(bank_name), outlets(outlet_name)").order("priority"),
    supabase.from("coa_mapping_rules").select("*, banks(bank_name), outlets(outlet_name), coa!coa_mapping_rules_result_coa_id_fkey(code, name)").order("priority"),
    supabase.from("banks").select("id, bank_name").eq("active", true).order("bank_name"),
    supabase.from("outlets").select("id, outlet_name").eq("active", true).order("outlet_name"),
    supabase.from("coa").select("id, code, name").eq("active", true).order("code"),
  ]);

  const editingOutlet = edit_outlet ? outletRules?.find((r) => r.id === edit_outlet) : null;
  const editingCoa = edit_coa ? coaRules?.find((r) => r.id === edit_coa) : null;

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />
      <PageHeader
        title="Mapping Rules"
        description="Outlet Mapping menentukan outlet dari Bank/Unit/Klasifikasi/Deskripsi. COA Mapping menentukan akun COA hasil. Rule dengan priority lebih kecil menang lebih dulu; jika priority sama, rule yang lebih spesifik (lebih banyak field terisi) menang. Rule tidak pernah dihapus, hanya dinonaktifkan."
      />

      <RuleTester banks={banks ?? []} outlets={outlets ?? []} coa={coa ?? []} />

      <section>
        <h2 className="text-base font-semibold text-navy mb-2">Outlet Mapping Rules</h2>
        <form action={saveOutletRule} className="bg-white border border-border rounded-lg p-4 mb-4 grid grid-cols-4 gap-3">
          {editingOutlet && <input type="hidden" name="id" value={editingOutlet.id} />}
          <FormField label="Bank">
            <select name="bank_id" defaultValue={editingOutlet?.bank_id ?? ""} className={inputClass}>
              <option value="">Bank apa saja</option>
              {banks?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Unit (exact, opsional)">
            <input name="unit_value" defaultValue={editingOutlet?.unit_value ?? ""} className={inputClass} />
          </FormField>
          <FormField label="Klasifikasi (exact, opsional)">
            <input name="classification" defaultValue={editingOutlet?.classification ?? ""} className={inputClass} />
          </FormField>
          <FormField label="Arah">
            <select name="direction" defaultValue={editingOutlet?.direction ?? ""} className={inputClass}>
              <option value="">Apa saja</option>
              <option value="out">Keluar (Kredit &gt; 0)</option>
              <option value="in">Masuk (Debit &gt; 0)</option>
            </select>
          </FormField>
          <FormField label="Match Type">
            <select name="match_type" defaultValue={editingOutlet?.match_type ?? "keyword"} className={inputClass}>
              <option value="exact">Exact</option>
              <option value="keyword">Keyword</option>
              <option value="regex">Regex</option>
            </select>
          </FormField>
          <FormField label="Match Value (terhadap Deskripsi, opsional)">
            <input name="match_value" defaultValue={editingOutlet?.match_value ?? ""} className={inputClass} />
          </FormField>
          <FormField label="Outlet Tujuan" required>
            <select name="output_outlet_id" defaultValue={editingOutlet?.output_outlet_id ?? ""} required className={inputClass}>
              <option value="">Pilih outlet…</option>
              {outlets?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.outlet_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Priority (lebih kecil = lebih diutamakan)">
            <input type="number" name="priority" defaultValue={editingOutlet?.priority ?? 100} className={inputClass} />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" name="active" defaultChecked={editingOutlet?.active ?? true} />
            Aktif
          </label>
          <div className="col-span-4">
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              {editingOutlet ? "Simpan Perubahan" : "Tambah Rule Outlet"}
            </button>
          </div>
        </form>

        <DataTable
          emptyMessage="Belum ada rule outlet mapping."
          columns={[
            { header: "Priority", cell: (r) => r.priority },
            { header: "Bank", cell: (r) => r.banks?.bank_name ?? "Apa saja" },
            { header: "Unit", cell: (r) => r.unit_value ?? "—" },
            { header: "Klasifikasi", cell: (r) => r.classification ?? "—" },
            { header: "Match", cell: (r) => (r.match_value ? `${r.match_type}: "${r.match_value}"` : "—") },
            { header: "Arah", cell: (r) => r.direction ?? "Apa saja" },
            { header: "→ Outlet", cell: (r) => r.outlets?.outlet_name ?? "—" },
            { header: "Status", cell: (r) => <ActiveBadge active={r.active} /> },
            {
              header: "",
              align: "right",
              cell: (r) => (
                <div className="space-x-3">
                  <a href={`/mapping/rules?edit_outlet=${r.id}`} className="text-navy underline">
                    Edit
                  </a>
                  <form action={toggleOutletRuleActive} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={String(r.active)} />
                    <ConfirmSubmitButton
                      confirmMessage={r.active ? "Nonaktifkan rule ini?" : "Aktifkan kembali rule ini?"}
                      className="text-gray-500 underline"
                    >
                      {r.active ? "Nonaktifkan" : "Aktifkan"}
                    </ConfirmSubmitButton>
                  </form>
                </div>
              ),
            },
          ]}
          rows={outletRules ?? []}
        />
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-2">COA Mapping Rules</h2>
        <form action={saveCoaRule} className="bg-white border border-border rounded-lg p-4 mb-4 grid grid-cols-4 gap-3">
          {editingCoa && <input type="hidden" name="id" value={editingCoa.id} />}
          <FormField label="Bank">
            <select name="bank_id" defaultValue={editingCoa?.bank_id ?? ""} className={inputClass}>
              <option value="">Bank apa saja</option>
              {banks?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Outlet">
            <select name="outlet_id" defaultValue={editingCoa?.outlet_id ?? ""} className={inputClass}>
              <option value="">Outlet apa saja</option>
              {outlets?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.outlet_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Unit (exact, opsional)">
            <input name="unit_value" defaultValue={editingCoa?.unit_value ?? ""} className={inputClass} />
          </FormField>
          <FormField label="Klasifikasi (exact, opsional)">
            <input name="classification" defaultValue={editingCoa?.classification ?? ""} className={inputClass} />
          </FormField>
          <FormField label="Keyword Deskripsi (opsional)">
            <input name="description_keyword" defaultValue={editingCoa?.description_keyword ?? ""} className={inputClass} />
          </FormField>
          <FormField label="Nominal Min (opsional)">
            <input name="amount_min" defaultValue={editingCoa?.amount_min ?? ""} className={inputClass} />
          </FormField>
          <FormField label="Nominal Max (opsional)">
            <input name="amount_max" defaultValue={editingCoa?.amount_max ?? ""} className={inputClass} />
          </FormField>
          <FormField label="COA Hasil" required>
            <select name="result_coa_id" defaultValue={editingCoa?.result_coa_id ?? ""} required className={inputClass}>
              <option value="">Pilih COA…</option>
              {coa?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Priority (lebih kecil = lebih diutamakan)">
            <input type="number" name="priority" defaultValue={editingCoa?.priority ?? 100} className={inputClass} />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" name="no_outlet_needed" defaultChecked={editingCoa?.no_outlet_needed ?? false} />
            Tidak perlu outlet (mis. Mutasi antar unit, Angsuran, Prive)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" name="active" defaultChecked={editingCoa?.active ?? true} />
            Aktif
          </label>
          <div className="col-span-4">
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              {editingCoa ? "Simpan Perubahan" : "Tambah Rule COA"}
            </button>
          </div>
        </form>

        <DataTable
          emptyMessage="Belum ada rule COA mapping."
          columns={[
            { header: "Priority", cell: (r) => r.priority },
            { header: "Bank", cell: (r) => r.banks?.bank_name ?? "Apa saja" },
            { header: "Outlet", cell: (r) => r.outlets?.outlet_name ?? (r.no_outlet_needed ? "Tidak perlu" : "Apa saja") },
            { header: "Klasifikasi", cell: (r) => r.classification ?? "—" },
            { header: "Keyword", cell: (r) => r.description_keyword ?? "—" },
            { header: "→ COA", cell: (r) => (r.coa ? `${r.coa.code} — ${r.coa.name}` : "—") },
            { header: "Status", cell: (r) => <ActiveBadge active={r.active} /> },
            {
              header: "",
              align: "right",
              cell: (r) => (
                <div className="space-x-3">
                  <a href={`/mapping/rules?edit_coa=${r.id}`} className="text-navy underline">
                    Edit
                  </a>
                  <form action={toggleCoaRuleActive} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={String(r.active)} />
                    <ConfirmSubmitButton
                      confirmMessage={r.active ? "Nonaktifkan rule ini?" : "Aktifkan kembali rule ini?"}
                      className="text-gray-500 underline"
                    >
                      {r.active ? "Nonaktifkan" : "Aktifkan"}
                    </ConfirmSubmitButton>
                  </form>
                </div>
              ),
            },
          ]}
          rows={coaRules ?? []}
        />
      </section>
    </div>
  );
}
