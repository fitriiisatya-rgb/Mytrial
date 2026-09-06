import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { Badge } from "@/components/cashflow/badge";
import { formatDateID } from "@/lib/cashflow/format";
import { ALERT_TYPE_LABELS as LABELS } from "@/lib/cashflow/labels";
import { updateAlertRule, acknowledgeAlert } from "./actions";

export default async function AlertSettingsPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);

  const [{ data: rules }, { data: openAlerts }] = await Promise.all([
    supabase.from("alert_rules").select("*").order("alert_type"),
    supabase.from("cashflow_alerts").select("*").eq("status", "OPEN").order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-8">
      <ErrorBanner message={searchParams.error} />

      <div>
        <h2 className="text-lg font-semibold text-navy mb-1">Ambang Batas Peringatan</h2>
        <p className="text-xs text-gray-500 mb-4">Ambang batas berlaku global (semua rekening) kecuali diarahkan ke rekening tertentu.</p>
        <div className="bg-white border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Jenis Peringatan</th>
                <th className="px-4 py-2">Ambang Batas Nominal (Rp)</th>
                <th className="px-4 py-2">Ambang Batas Jam</th>
                <th className="px-4 py-2">Aktif</th>
                {canWrite && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {rules?.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium text-navy">{LABELS[r.alert_type] ?? r.alert_type}</td>
                  <td className="px-4 py-2">
                    {canWrite ? (
                      <form action={updateAlertRule} id={`form-${r.id}`} className="contents">
                        <input type="hidden" name="id" value={r.id} />
                        <input
                          type="number"
                          name="threshold_amount"
                          form={`form-${r.id}`}
                          defaultValue={r.threshold_amount ?? ""}
                          className="w-40 border border-border rounded-lg px-2 py-1 text-sm"
                          disabled={r.alert_type === "STALE_SYNC"}
                        />
                      </form>
                    ) : (
                      r.threshold_amount ?? "-"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {canWrite ? (
                      <input
                        type="number"
                        name="threshold_hours"
                        form={`form-${r.id}`}
                        defaultValue={r.threshold_hours ?? ""}
                        className="w-24 border border-border rounded-lg px-2 py-1 text-sm"
                        disabled={r.alert_type !== "STALE_SYNC"}
                      />
                    ) : (
                      r.threshold_hours ?? "-"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {canWrite ? (
                      <input type="checkbox" name="is_active" form={`form-${r.id}`} defaultChecked={r.is_active} />
                    ) : r.is_active ? (
                      "Ya"
                    ) : (
                      "Tidak"
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-2 text-right">
                      <button type="submit" form={`form-${r.id}`} className="text-navy underline text-sm">
                        Simpan
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-navy mb-3">Peringatan Terbuka</h2>
        <div className="bg-white border border-border rounded-lg divide-y divide-border">
          {openAlerts?.map((a) => (
            <div key={a.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
              <div>
                <Badge tone={a.severity === "CRITICAL" ? "negative" : a.severity === "WARNING" ? "warning" : "info"}>
                  {LABELS[a.alert_type] ?? a.alert_type}
                </Badge>
                <span className="ml-2 text-gray-700 break-words">{a.message}</span>
                <span className="ml-2 text-xs text-gray-400">{formatDateID(a.created_at)}</span>
              </div>
              {canWrite && (
                <form action={acknowledgeAlert}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="text-xs text-gray-500 underline">
                    Tandai Dibaca
                  </button>
                </form>
              )}
            </div>
          ))}
          {!openAlerts?.length && <div className="px-4 py-6 text-center text-sm text-gray-400">Tidak ada alert terbuka.</div>}
        </div>
      </div>
    </div>
  );
}
