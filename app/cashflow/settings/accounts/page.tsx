import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { formatRupiah, maskAccountNumber, formatDateID } from "@/lib/cashflow/format";
import { saveBankAccount, toggleAccountActive } from "./actions";

export default async function BankAccountsSettingsPage({ searchParams }: { searchParams: { error?: string; edit?: string } }) {
  const supabase = await createClient();
  const { canWrite } = await requireCashflowAccess(supabase);
  const { error, edit } = searchParams;

  const { data: accounts } = await supabase.from("bank_accounts").select("*").order("display_order").order("account_name");
  const editing = edit ? accounts?.find((a) => a.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <h2 className="text-lg font-semibold text-navy mb-1">Bank Accounts</h2>
      <p className="text-xs text-gray-500 mb-4">
        Master rekening cashflow — independen dari Chart of Accounts. Setiap rekening (mis. BCA AMOR vs BCA IKI) punya identitas
        sendiri, bukan sekadar nama bank.
      </p>

      {canWrite && (
        <form action={saveBankAccount} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kode Rekening</label>
            <input name="account_code" defaultValue={editing?.account_code} required className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama Rekening (identitas)</label>
            <input name="account_name" defaultValue={editing?.account_name} required placeholder="mis. BCA AMOR" className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nama Bank</label>
            <input name="bank_name" defaultValue={editing?.bank_name} required className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">No. Rekening</label>
            <input name="account_number" defaultValue={editing?.account_number ?? ""} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Entitas/Unit (opsional)</label>
            <input name="entity_label" defaultValue={editing?.entity_label ?? ""} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Label di Spreadsheet</label>
            <input
              name="sheet_label"
              defaultValue={editing?.sheet_label ?? ""}
              placeholder="Teks persis di kolom Bank/Rekening"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Opening Balance</label>
            <input
              name="opening_balance"
              type="number"
              step="0.01"
              defaultValue={editing?.opening_balance ?? "0"}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tanggal Opening Balance</label>
            <input
              name="opening_balance_date"
              type="date"
              defaultValue={editing?.opening_balance_date ?? new Date().toISOString().slice(0, 10)}
              required
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 mt-6">
            <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} />
            Aktif
          </label>
          <div className="col-span-3">
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              {editing ? "Simpan" : "Tambah Rekening"}
            </button>
          </div>
        </form>
      )}

      <table className="w-full text-sm bg-white border border-border rounded-lg overflow-hidden">
        <thead className="bg-surface text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Kode</th>
            <th className="px-4 py-2">Rekening</th>
            <th className="px-4 py-2">Bank</th>
            <th className="px-4 py-2">No. Rekening</th>
            <th className="px-4 py-2 text-right">Opening Balance</th>
            <th className="px-4 py-2">Status</th>
            {canWrite && <th className="px-4 py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {accounts?.map((a) => (
            <tr key={a.id} className="border-t border-border">
              <td className="px-4 py-2 font-mono text-xs">{a.account_code}</td>
              <td className="px-4 py-2 font-medium text-navy">{a.account_name}</td>
              <td className="px-4 py-2">{a.bank_name}</td>
              <td className="px-4 py-2">{maskAccountNumber(a.account_number)}</td>
              <td className="px-4 py-2 text-right">
                {formatRupiah(a.opening_balance)}
                <div className="text-xs text-gray-400">{formatDateID(a.opening_balance_date)}</div>
              </td>
              <td className="px-4 py-2">{a.is_active ? "Aktif" : "Nonaktif"}</td>
              {canWrite && (
                <td className="px-4 py-2 text-right space-x-3">
                  <a href={`/cashflow/settings/accounts?edit=${a.id}`} className="text-navy underline">
                    Edit
                  </a>
                  <form action={toggleAccountActive} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={String(a.is_active)} />
                    <button type="submit" className="text-gray-500 underline">
                      {a.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {!accounts?.length && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                Belum ada rekening.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
