import { formatRupiah, formatDateID } from "@/lib/cashflow/format";
import { TRANSACTION_TYPE_LABELS } from "@/lib/cashflow/labels";
import { Badge } from "./badge";

export interface TransactionRow {
  transaction_id: string;
  transaction_date: string;
  description: string | null;
  classification: string | null;
  transaction_type: string;
  cash_in: string;
  cash_out: string;
  running_balance: string;
  source_type: string;
  source_sheet: string | null;
  source_row_id: string | null;
  bank_accounts?: { account_name: string; bank_name: string } | null;
  cashflow_categories?: { name: string } | null;
}

const TYPE_TONE: Record<string, "positive" | "negative" | "info"> = {
  CASH_IN: "positive",
  CASH_OUT: "negative",
  INTERNAL_TRANSFER_IN: "info",
  INTERNAL_TRANSFER_OUT: "info",
};

export function TransactionsTable({ rows, showAccount = true }: { rows: TransactionRow[]; showAccount?: boolean }) {
  return (
    <div className="bg-white border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead className="bg-surface text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Tanggal</th>
            {showAccount && <th className="px-4 py-2">Rekening</th>}
            <th className="px-4 py-2">Deskripsi</th>
            <th className="px-4 py-2">Klasifikasi</th>
            <th className="px-4 py-2">Kategori</th>
            <th className="px-4 py-2 text-right">Penerimaan</th>
            <th className="px-4 py-2 text-right">Pengeluaran</th>
            <th className="px-4 py-2 text-right">Saldo</th>
            <th className="px-4 py-2">Tipe</th>
            <th className="px-4 py-2">Sumber</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.transaction_id} className="border-t border-border align-top">
              <td className="px-4 py-2 whitespace-nowrap">{formatDateID(r.transaction_date)}</td>
              {showAccount && (
                <td className="px-4 py-2 whitespace-nowrap">
                  {r.bank_accounts?.account_name}
                  <div className="text-xs text-gray-400">{r.bank_accounts?.bank_name}</div>
                </td>
              )}
              <td className="px-4 py-2 max-w-xs truncate" title={r.description ?? ""}>
                {r.description || "-"}
              </td>
              <td className="px-4 py-2 text-gray-500">{r.classification || "-"}</td>
              <td className="px-4 py-2 text-gray-500">{r.cashflow_categories?.name || "-"}</td>
              <td className="px-4 py-2 text-right text-emerald-600">{Number(r.cash_in) > 0 ? formatRupiah(r.cash_in) : "-"}</td>
              <td className="px-4 py-2 text-right text-red-600">{Number(r.cash_out) > 0 ? formatRupiah(r.cash_out) : "-"}</td>
              <td className="px-4 py-2 text-right font-semibold">{formatRupiah(r.running_balance)}</td>
              <td className="px-4 py-2">
                <Badge tone={TYPE_TONE[r.transaction_type] ?? "neutral"}>{TRANSACTION_TYPE_LABELS[r.transaction_type] ?? r.transaction_type}</Badge>
              </td>
              <td className="px-4 py-2 text-xs text-gray-400" title={`${r.source_sheet ?? ""} / Baris ${r.source_row_id ?? "-"}`}>
                {r.source_type === "google_sheet" ? `Sheet · Baris ${r.source_row_id ?? "-"}` : r.source_type === "manual" ? "Manual" : "Sistem"}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showAccount ? 10 : 9} className="px-4 py-8 text-center text-gray-400">
                Tidak ada transaksi untuk filter ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
