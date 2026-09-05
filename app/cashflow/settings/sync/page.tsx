import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { Badge } from "@/components/cashflow/badge";
import { formatDateID } from "@/lib/cashflow/format";
import { triggerSyncNow, saveSyncConfig, resolveSyncError } from "./actions";
import { SYNC_ISSUE_LABELS } from "@/lib/cashflow/labels";

function formatDateTimeID(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  }).format(new Date(iso)) + " WIB";
}

const BATCH_TONE: Record<string, "positive" | "negative" | "warning" | "info"> = {
  completed: "positive",
  failed: "negative",
  partial: "warning",
  running: "info",
};

export default async function SyncSettingsPage({ searchParams }: { searchParams: { error?: string; synced?: string } }) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  const { error, synced } = searchParams;

  const [{ data: configRows }, { data: batches }, { data: openErrors }] = await Promise.all([
    supabase.from("sync_config").select("*"),
    supabase.from("sync_batches").select("*").order("started_at", { ascending: false }).limit(20),
    supabase.from("sync_errors").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(50),
  ]);

  const config = new Map((configRows ?? []).map((r) => [r.key, typeof r.value === "string" ? JSON.parse(r.value as string) : r.value]));
  const lastBatch = batches?.[0];

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />
      {synced && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Sync selesai (batch {synced}).</div>}

      <div>
        <h2 className="text-lg font-semibold text-navy mb-1">Google Sheet Sync</h2>
        <p className="text-xs text-gray-500 mb-4">
          Sumber data: Google Sheet → Sync Service → Database → Web. Kredensial Google disimpan sebagai environment variable
          server-side, tidak pernah dikirim ke browser.
        </p>

        <div className="bg-white border border-border rounded-lg p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-navy">Google Sheets</span>
              {lastBatch && <Badge tone={BATCH_TONE[lastBatch.status] ?? "neutral"}>{lastBatch.status}</Badge>}
            </div>
            {canWrite && (
              <form action={triggerSyncNow}>
                <button type="submit" className="bg-navy text-white rounded-lg px-5 py-2.5 text-sm font-semibold">
                  Sync Sekarang
                </button>
              </form>
            )}
          </div>
          {lastBatch ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
              <div>
                <div className="text-xs text-gray-500 uppercase">Sync Terakhir</div>
                <div className="text-navy font-medium">{formatDateTimeID(lastBatch.finished_at ?? lastBatch.started_at)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Diproses</div>
                <div className="text-navy font-medium">{lastBatch.rows_read.toLocaleString("id-ID")}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Baru</div>
                <div className="text-emerald-600 font-medium">{lastBatch.rows_imported.toLocaleString("id-ID")}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Diperbarui</div>
                <div className="text-blue-600 font-medium">{lastBatch.rows_updated.toLocaleString("id-ID")}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Dilewati</div>
                <div className="text-gray-500 font-medium">{lastBatch.rows_skipped.toLocaleString("id-ID")}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Bermasalah</div>
                <div className={lastBatch.rows_error > 0 ? "text-red-600 font-medium" : "text-gray-500 font-medium"}>
                  {lastBatch.rows_error.toLocaleString("id-ID")}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-sm">Belum pernah sync.</div>
          )}
        </div>

        {canWrite && (
          <form action={saveSyncConfig} className="bg-white border border-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Spreadsheet ID</label>
              <input name="spreadsheet_id" defaultValue={config.get("spreadsheet_id") ?? ""} required className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama Sheet/Tab</label>
              <input name="sheet_name" defaultValue={config.get("sheet_name") ?? "Master"} required className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Arah Debit / Kredit</label>
              <select name="debit_credit_polarity" defaultValue={config.get("debit_credit_polarity") ?? "debit_is_cash_out"} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
                <option value="debit_is_cash_out">Debit = Pengeluaran, Kredit = Penerimaan (default buku bank)</option>
                <option value="debit_is_cash_in">Debit = Penerimaan, Kredit = Pengeluaran</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Ambang Batas Sinkronisasi Tertunda (jam)</label>
              <input name="stale_sync_hours" type="number" defaultValue={config.get("stale_sync_hours") ?? 24} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="bg-white border border-border text-navy rounded-lg px-4 py-2 text-sm font-semibold">
                Simpan Konfigurasi
              </button>
            </div>
          </form>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-navy mb-3">Riwayat Sinkronisasi</h2>
        <div className="bg-white border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Waktu</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Pemicu</th>
                <th className="px-4 py-2 text-right">Diproses</th>
                <th className="px-4 py-2 text-right">Baru</th>
                <th className="px-4 py-2 text-right">Diperbarui</th>
                <th className="px-4 py-2 text-right">Dilewati</th>
                <th className="px-4 py-2 text-right">Bermasalah</th>
              </tr>
            </thead>
            <tbody>
              {batches?.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-2">{formatDateTimeID(b.started_at)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={BATCH_TONE[b.status] ?? "neutral"}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{b.trigger_type === "manual" ? "Manual" : "Terjadwal"}</td>
                  <td className="px-4 py-2 text-right">{b.rows_read}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">{b.rows_imported}</td>
                  <td className="px-4 py-2 text-right text-blue-600">{b.rows_updated}</td>
                  <td className="px-4 py-2 text-right text-gray-400">{b.rows_skipped}</td>
                  <td className="px-4 py-2 text-right text-red-600">{b.rows_error}</td>
                </tr>
              ))}
              {!batches?.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                    Belum ada riwayat sync.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-navy mb-3">Kendala Sinkronisasi ({openErrors?.length ?? 0} terbuka)</h2>
        <div className="bg-white border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Waktu</th>
                <th className="px-4 py-2">Sheet / Row</th>
                <th className="px-4 py-2">Jenis</th>
                <th className="px-4 py-2">Pesan</th>
                {canWrite && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {openErrors?.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateID(e.created_at)}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {e.source_sheet} / {e.source_row_id ?? "-"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={e.issue_type === "unknown_account" ? "info" : "warning"}>{SYNC_ISSUE_LABELS[e.issue_type] ?? e.issue_type}</Badge>
                  </td>
                  <td className="px-4 py-2">{e.message}</td>
                  {canWrite && (
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      <form action={resolveSyncError} className="inline">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="next_status" value="resolved" />
                        <button type="submit" className="text-navy underline">
                          Selesai
                        </button>
                      </form>
                      <form action={resolveSyncError} className="inline">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="next_status" value="ignored" />
                        <button type="submit" className="text-gray-400 underline">
                          Abaikan
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {!openErrors?.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    Tidak ada isu terbuka.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
