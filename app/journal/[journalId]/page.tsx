import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { StatusBadge } from "@/components/master-data/status-badge";
import { ConfirmSubmitButton } from "@/components/master-data/confirm-submit-button";
import { fromSen, toSen } from "@/lib/money";
import { reviewJournalAction, approveJournalAction, postJournalAction, reverseJournalAction } from "../actions";

const SOURCE_LABELS: Record<string, string> = {
  bank_expense: "Pengeluaran Bank",
  revenue: "Penerimaan",
  manual: "Manual",
  allocation: "Shared Cost",
  interbank_transfer: "Transfer Antar Bank",
  opening_balance: "Saldo Awal",
};

export default async function JournalDetailPage({ params, searchParams }: { params: { journalId: string }; searchParams: { error?: string } }) {
  const supabase = await createClient();
  const { data: journal } = await supabase
    .from("journal_headers")
    .select(
      "*, entities(name), accounting_periods(period_month, period_year, status), import_batches(source_name), journal_lines(*, coa(code, name, account_type, normal_balance), outlets(outlet_name), banks(bank_name))"
    )
    .eq("id", params.journalId)
    .single();

  if (!journal) notFound();

  const actorIds = [journal.created_by, journal.reviewed_by, journal.approved_by, journal.posted_by].filter(Boolean) as string[];
  const { data: profiles } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const nameOf = (id: string | null) => (id ? profiles?.find((p) => p.id === id)?.full_name ?? id : "—");

  // Source traceability (spec U): for bank_expense/allocation, the row
  // this journal came from IS bank_transactions_raw (allocation's
  // source_id is the bank_transactions_raw.id too — see
  // buildSharedCostJournal). For revenue/interbank_transfer, their own
  // dedicated source tables.
  let sourceDetail: Record<string, unknown> | null = null;
  if ((journal.source_type === "bank_expense" || journal.source_type === "allocation") && journal.source_id) {
    const { data } = await supabase
      .from("bank_transactions_raw")
      .select("bank_label_raw, classification_raw, description_raw, txn_date, source_row_ref, matched_outlet_rule_id, matched_coa_rule_id, import_batch_id")
      .eq("id", journal.source_id)
      .maybeSingle();
    sourceDetail = data;
  } else if (journal.source_type === "revenue" && journal.source_id) {
    const { data } = await supabase
      .from("revenue_transactions_raw")
      .select("outlet_raw, description, revenue_category, txn_date, revenue_source_id")
      .eq("id", journal.source_id)
      .maybeSingle();
    sourceDetail = data;
  } else if (journal.source_type === "interbank_transfer" && journal.source_id) {
    const { data } = await supabase
      .from("bank_transfers")
      .select("source_transaction_id, destination_transaction_id, pairing_status, amount, transfer_date")
      .eq("id", journal.source_id)
      .maybeSingle();
    sourceDetail = data;
  }

  const totalDebit = journal.journal_lines.reduce((s, l) => s + toSen(l.debit), 0n);
  const totalCredit = journal.journal_lines.reduce((s, l) => s + toSen(l.credit), 0n);
  const difference = totalDebit - totalCredit;

  return (
    <div className="space-y-6">
      <ErrorBanner message={searchParams.error} />
      <PageHeader
        title={`Jurnal ${journal.journal_number}`}
        description={journal.description ?? undefined}
        action={<StatusBadge label={journal.status} variant={journal.status === "posted" ? "success" : journal.status === "reversed" ? "danger" : "neutral"} />}
      />

      <section className="bg-white border border-border rounded-lg p-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs text-gray-500 uppercase">Tanggal</div>
          <div>{journal.journal_date}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Entitas</div>
          <div>{journal.entities?.name ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Sumber</div>
          <div>{SOURCE_LABELS[journal.source_type] ?? journal.source_type}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Periode</div>
          <div>
            {journal.accounting_periods?.period_month}/{journal.accounting_periods?.period_year} ({journal.accounting_periods?.status})
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Batch Import</div>
          <div>{journal.import_batches?.source_name ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Reversal Of</div>
          <div>{journal.reversal_of_id ? <Link href={`/journal/${journal.reversal_of_id}`} className="text-navy underline">Lihat asal</Link> : "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Dibuat oleh</div>
          <div>{nameOf(journal.created_by)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Direview oleh</div>
          <div>{nameOf(journal.reviewed_by)} {journal.reviewed_at && `(${new Date(journal.reviewed_at).toLocaleString("id-ID")})`}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Disetujui oleh</div>
          <div>{nameOf(journal.approved_by)} {journal.approved_at && `(${new Date(journal.approved_at).toLocaleString("id-ID")})`}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Diposting oleh</div>
          <div>{nameOf(journal.posted_by)} {journal.posted_at && `(${new Date(journal.posted_at).toLocaleString("id-ID")})`}</div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-2">Baris Jurnal</h2>
        <div className="bg-white border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">COA</th>
                <th className="px-4 py-2">Outlet</th>
                <th className="px-4 py-2">Bank</th>
                <th className="px-4 py-2">Deskripsi</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {journal.journal_lines
                .sort((a, b) => a.line_no - b.line_no)
                .map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-4 py-2">{l.coa ? `${l.coa.code} — ${l.coa.name}` : "—"}</td>
                    <td className="px-4 py-2">{l.outlets?.outlet_name ?? "—"}</td>
                    <td className="px-4 py-2">{l.banks?.bank_name ?? "—"}</td>
                    <td className="px-4 py-2">{l.description ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{l.debit !== "0.00" ? fromSen(toSen(l.debit)) : "—"}</td>
                    <td className="px-4 py-2 text-right">{l.credit !== "0.00" ? fromSen(toSen(l.credit)) : "—"}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot className="border-t-2 border-border font-semibold">
              <tr>
                <td className="px-4 py-2" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-2 text-right">{fromSen(totalDebit)}</td>
                <td className="px-4 py-2 text-right">{fromSen(totalCredit)}</td>
              </tr>
              <tr>
                <td className="px-4 py-2" colSpan={4}>
                  Selisih
                </td>
                <td className="px-4 py-2 text-right" colSpan={2}>
                  <span className={difference === 0n ? "text-green-700" : "text-red-700"}>{fromSen(difference)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {sourceDetail && (
        <section>
          <h2 className="text-base font-semibold text-navy mb-2">Traceability Sumber</h2>
          <div className="bg-white border border-border rounded-lg p-4 text-sm space-y-1">
            {Object.entries(sourceDetail).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border/50 py-1">
                <span className="text-gray-500">{k}</span>
                <span>{v === null ? "—" : String(v)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white border border-border rounded-lg p-4 flex flex-wrap gap-3 items-end">
        {journal.status === "draft" && (
          <form action={reviewJournalAction}>
            <input type="hidden" name="id" value={journal.id} />
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              Review
            </button>
          </form>
        )}
        {journal.status === "reviewed" && (
          <form action={approveJournalAction}>
            <input type="hidden" name="id" value={journal.id} />
            <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              Approve
            </button>
          </form>
        )}
        {journal.status === "approved" && (
          <form action={postJournalAction}>
            <input type="hidden" name="id" value={journal.id} />
            <ConfirmSubmitButton confirmMessage="Post jurnal ini? Setelah posted, jurnal tidak bisa diedit langsung." className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
              Post
            </ConfirmSubmitButton>
          </form>
        )}
        {journal.status === "posted" && (
          <form action={reverseJournalAction} className="flex gap-2 items-end">
            <input type="hidden" name="id" value={journal.id} />
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">Tanggal Reversal</label>
              <input type="date" name="reversal_date" required defaultValue={journal.journal_date} className="border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">Alasan</label>
              <input type="text" name="reason" className="border border-border rounded-lg px-3 py-2 text-sm" placeholder="Alasan reversal" />
            </div>
            <ConfirmSubmitButton
              confirmMessage="Reverse jurnal ini? Jurnal asal akan ditandai reversed dan jurnal kebalikan akan langsung diposting."
              className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold"
            >
              Reverse
            </ConfirmSubmitButton>
          </form>
        )}
        {journal.status === "reversed" && <span className="text-sm text-gray-500">Jurnal ini sudah direverse — tidak ada aksi lanjutan.</span>}
      </section>
    </div>
  );
}
