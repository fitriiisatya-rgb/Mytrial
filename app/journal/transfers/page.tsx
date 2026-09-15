import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { StatusBadge } from "@/components/master-data/status-badge";
import { inputClass } from "@/components/master-data/form-field";
import { suggestAndCreateTransfer, confirmTransfer, generateTransferJournal } from "../actions";

/**
 * Spec E — Interbank/Interunit Transfer workflow. Never posted as a
 * normal expense: a row flagged is_interbank_transfer by the Phase 4
 * Mapping Engine lands here first, gets an (optional) auto-suggested
 * pairing to its likely destination, a human confirms (or confirms
 * "no destination, use the clearing account"), and only then is a
 * journal generated.
 */
export default async function TransfersPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = await createClient();

  const { data: unqueuedRows } = await supabase
    .from("bank_transactions_raw")
    .select("id, bank_label_raw, txn_date, credit, description_raw, banks(entity_id)")
    .eq("is_interbank_transfer", true)
    .eq("processed", false);

  const { data: transfers } = await supabase
    .from("bank_transfers")
    .select("*, source:bank_transactions_raw!bank_transfers_source_transaction_id_fkey(bank_label_raw, description_raw)")
    .order("created_at", { ascending: false });

  const queuedSourceIds = new Set((transfers ?? []).map((t) => t.source_transaction_id));
  const notYetQueued = (unqueuedRows ?? []).filter((r) => !queuedSourceIds.has(r.id));

  const { data: candidateDestinations } = await supabase
    .from("bank_transactions_raw")
    .select("id, bank_label_raw, txn_date, debit, bank_id")
    .gt("debit", 0);

  const { data: banks } = await supabase.from("banks").select("id, entity_id");
  const entityIdForBank = new Map((banks ?? []).map((b) => [b.id, b.entity_id]));

  return (
    <div className="space-y-6">
      <ErrorBanner message={searchParams.error} />
      <PageHeader
        title="Transfer Antar Bank/Unit"
        description="Transaksi yang ditandai sebagai kandidat interbank/interunit oleh Mapping Engine tidak pernah masuk P&L sebagai beban — harus dipasangkan (atau dikonfirmasi tanpa pasangan) sebelum jurnal dibuat."
      />

      <section>
        <h2 className="text-base font-semibold text-navy mb-2">Belum Diantrikan ({notYetQueued.length})</h2>
        <DataTable
          emptyMessage="Tidak ada transaksi transfer baru."
          columns={[
            { header: "Bank", cell: (r) => r.bank_label_raw },
            { header: "Tanggal", cell: (r) => r.txn_date },
            { header: "Nominal", align: "right", cell: (r) => r.credit },
            { header: "Deskripsi", cell: (r) => r.description_raw ?? "—" },
            {
              header: "",
              align: "right",
              cell: (r) => (
                <form action={suggestAndCreateTransfer}>
                  <input type="hidden" name="source_transaction_id" value={r.id} />
                  <button type="submit" className="text-navy underline text-sm">
                    Cari &amp; Antrikan
                  </button>
                </form>
              ),
            },
          ]}
          rows={notYetQueued}
        />
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-2">Antrian Transfer</h2>
        <DataTable
          emptyMessage="Belum ada transfer yang diantrikan."
          columns={[
            { header: "Sumber", cell: (t) => t.source?.bank_label_raw ?? "—" },
            { header: "Tanggal", cell: (t) => t.transfer_date },
            { header: "Nominal", align: "right", cell: (t) => t.amount },
            {
              header: "Status",
              cell: (t) => (
                <StatusBadge
                  label={t.pairing_status}
                  variant={t.pairing_status === "confirmed" ? "success" : t.pairing_status === "suggested" ? "warning" : "neutral"}
                />
              ),
            },
            {
              header: "Aksi",
              cell: (t) => {
                if (t.journal_id) return <span className="text-xs text-gray-500">Jurnal dibuat</span>;
                if (t.pairing_status !== "confirmed") {
                  return (
                    <form action={confirmTransfer} className="flex gap-1 items-center">
                      <input type="hidden" name="id" value={t.id} />
                      <select name="destination_transaction_id" defaultValue={t.destination_transaction_id ?? ""} className="border border-border rounded px-2 py-1 text-xs">
                        <option value="">Tanpa pasangan (pakai clearing)</option>
                        {candidateDestinations
                          ?.filter((d) => d.bank_id !== t.source_bank_id)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.bank_label_raw} · {d.txn_date} · {d.debit}
                            </option>
                          ))}
                      </select>
                      <input
                        type="hidden"
                        name="destination_bank_id"
                        value={candidateDestinations?.find((d) => d.id === t.destination_transaction_id)?.bank_id ?? ""}
                      />
                      <button type="submit" className="text-navy underline text-xs">
                        Konfirmasi
                      </button>
                    </form>
                  );
                }
                return (
                  <form action={generateTransferJournal}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="entity_id" value={entityIdForBank.get(t.source_bank_id) ?? ""} />
                    <button type="submit" className="text-navy underline text-xs">
                      Buat Jurnal
                    </button>
                  </form>
                );
              },
            },
          ]}
          rows={transfers ?? []}
        />
      </section>
    </div>
  );
}
