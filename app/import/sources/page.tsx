import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { ActiveBadge } from "@/components/master-data/status-badge";
import { ConfirmSubmitButton } from "@/components/master-data/confirm-submit-button";
import { FormField, inputClass } from "@/components/master-data/form-field";
import { saveSourceConfig, toggleSourceConfigActive, syncGoogleSheetNow } from "./actions";

export default async function ImportSourcesPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string };
}) {
  const { error, edit } = searchParams;
  const supabase = await createClient();
  const [{ data: configs }, { data: entities }, { data: revenueSources }] = await Promise.all([
    supabase.from("import_source_configs").select("*, entities(name)").order("name"),
    supabase.from("entities").select("id, name").eq("active", true).order("name"),
    supabase.from("revenue_sources").select("id, code, name").eq("active", true).order("code"),
  ]);
  const editing = edit ? configs?.find((c) => c.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader
        title="Sumber Data"
        description='Konfigurasi kolom yang bisa dipakai ulang untuk file yang berulang, dan sinkronisasi Google Sheet. Sheet harus dibagikan sebagai "Anyone with the link can view" untuk sinkronisasi tanpa kredensial tambahan.'
      />

      <form action={saveSourceConfig} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <FormField label="Entitas" required>
          <select name="entity_id" defaultValue={editing?.entity_id} required className={inputClass}>
            <option value="">Pilih entitas…</option>
            {entities?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Nama Konfigurasi" required>
          <input name="name" defaultValue={editing?.name} required className={inputClass} />
        </FormField>
        <FormField label="Target" required>
          <select name="target" defaultValue={editing?.target ?? "bank_expense"} required className={inputClass}>
            <option value="bank_expense">Pengeluaran Bank</option>
            <option value="revenue">Penerimaan</option>
          </select>
        </FormField>
        <FormField label="Jenis Sumber" required>
          <select name="source_type" defaultValue={editing?.source_type ?? "google_sheet"} required className={inputClass}>
            <option value="google_sheet">Google Sheet</option>
            <option value="csv_upload">CSV Upload</option>
            <option value="excel_upload">Excel Upload</option>
          </select>
        </FormField>
        <FormField label="Spreadsheet ID">
          <input name="spreadsheet_id" defaultValue={editing?.spreadsheet_id ?? ""} placeholder="hanya untuk Google Sheet" className={inputClass} />
        </FormField>
        <FormField label="Nama Sheet/Tab">
          <input name="sheet_name" defaultValue={editing?.sheet_name ?? ""} placeholder="hanya untuk Google Sheet" className={inputClass} />
        </FormField>
        <FormField label="Baris Header">
          <input type="number" name="header_row" defaultValue={editing?.header_row ?? 1} min={1} className={inputClass} />
        </FormField>
        <FormField label="Revenue Source">
          <select name="revenue_source_id" defaultValue={editing?.revenue_source_id ?? ""} className={inputClass}>
            <option value="">— (hanya untuk target Penerimaan)</option>
            {revenueSources?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} — {r.name}
              </option>
            ))}
          </select>
        </FormField>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
          Aktif
        </label>
        <div className="col-span-3">
          <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
            {editing ? "Simpan" : "Tambah"}
          </button>
        </div>
      </form>

      <DataTable
        emptyMessage="Belum ada konfigurasi sumber data."
        columns={[
          { header: "Nama", cell: (c) => c.name },
          { header: "Entitas", cell: (c) => c.entities?.name ?? "—" },
          { header: "Target", cell: (c) => (c.target === "bank_expense" ? "Pengeluaran Bank" : "Penerimaan") },
          { header: "Jenis", cell: (c) => c.source_type },
          { header: "Sheet", cell: (c) => (c.spreadsheet_id ? `${c.spreadsheet_id.slice(0, 12)}…/${c.sheet_name}` : "—") },
          { header: "Sinkron Terakhir", cell: (c) => (c.last_sync_at ? new Date(c.last_sync_at).toLocaleString("id-ID") : "belum pernah") },
          { header: "Status", cell: (c) => <ActiveBadge active={c.active} /> },
          {
            header: "",
            align: "right",
            cell: (c) => (
              <div className="space-x-3">
                {c.source_type === "google_sheet" && c.active && (
                  <form action={syncGoogleSheetNow} className="inline">
                    <input type="hidden" name="config_id" value={c.id} />
                    <button type="submit" className="text-navy underline">
                      Sync Now
                    </button>
                  </form>
                )}
                <a href={`/import/sources?edit=${c.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleSourceConfigActive} className="inline">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={String(c.active)} />
                  <ConfirmSubmitButton
                    confirmMessage={c.active ? `Nonaktifkan sumber "${c.name}"?` : `Aktifkan kembali sumber "${c.name}"?`}
                    className="text-gray-500 underline"
                  >
                    {c.active ? "Nonaktifkan" : "Aktifkan"}
                  </ConfirmSubmitButton>
                </form>
              </div>
            ),
          },
        ]}
        rows={configs ?? []}
      />
    </div>
  );
}
