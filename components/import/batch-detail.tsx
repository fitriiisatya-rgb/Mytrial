import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/master-data/data-table";
import { StatusBadge } from "@/components/master-data/status-badge";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success",
  completed_with_errors: "warning",
  processing: "neutral",
  draft: "neutral",
  failed: "danger",
};

export async function BatchDetail({ batchId }: { batchId: string }) {
  const supabase = await createClient();
  const { data: batch } = await supabase
    .from("import_batches")
    .select("*, entities(name), profiles(full_name)")
    .eq("id", batchId)
    .single();
  if (!batch) notFound();

  const [{ data: rowErrors }, { data: bankRowIds }, { data: revenueRowIds }] = await Promise.all([
    supabase.from("import_row_errors").select("*").eq("import_batch_id", batchId).order("row_number").limit(200),
    supabase.from("bank_transactions_raw").select("id").eq("import_batch_id", batchId),
    supabase.from("revenue_transactions_raw").select("id").eq("import_batch_id", batchId),
  ]);

  const sourceIds = [...(bankRowIds ?? []).map((r) => r.id), ...(revenueRowIds ?? []).map((r) => r.id)];
  const { data: exceptions } = sourceIds.length
    ? await supabase.from("exceptions").select("*").in("source_id", sourceIds).order("created_at", { ascending: false }).limit(200)
    : { data: [] };

  return (
    <div>
      <Link href="/import/history" className="text-sm text-navy underline">
        ‹ Kembali ke riwayat import
      </Link>
      <div className="flex justify-between items-start mb-4 mt-2">
        <div>
          <h2 className="text-lg font-semibold text-navy">{batch.source_name ?? batch.source_ref}</h2>
          <p className="text-xs text-gray-500 mt-1">
            {batch.entities?.name} — {batch.source} — diimpor{" "}
            {batch.completed_at ? new Date(batch.completed_at).toLocaleString("id-ID") : "belum selesai"}
          </p>
        </div>
        <StatusBadge label={batch.status} variant={STATUS_VARIANT[batch.status] ?? "neutral"} />
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <Stat label="Total Baris" value={batch.row_count} />
        <Stat label="Valid" value={batch.valid_rows} />
        <Stat label="Duplikat (Dilewati)" value={batch.duplicate_count} />
        <Stat label="Perlu Ditinjau" value={batch.skipped_rows} />
        <Stat label="Error" value={batch.error_count} />
      </div>

      {rowErrors && rowErrors.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-navy mb-2">Baris Ditolak (tidak dapat disimpan)</h3>
          <DataTable
            emptyMessage="Tidak ada."
            columns={[
              { header: "Baris #", cell: (r) => r.row_number },
              { header: "Kode Error", cell: (r) => r.error_code },
              { header: "Pesan", cell: (r) => r.error_message },
            ]}
            rows={rowErrors}
          />
        </>
      )}

      <h3 className="text-sm font-semibold text-navy mb-2 mt-6">Baris Ditandai untuk Ditinjau</h3>
      <DataTable
        emptyMessage="Tidak ada baris yang perlu ditinjau untuk batch ini."
        columns={[
          { header: "Tipe", cell: (e) => e.exception_type },
          { header: "Status", cell: (e) => e.status },
          { header: "Dibuat", cell: (e) => new Date(e.created_at).toLocaleString("id-ID") },
        ]}
        rows={exceptions ?? []}
      />

      <p className="text-xs text-gray-400 mt-6">
        Diimpor oleh: {batch.profiles?.full_name ?? "—"} · Batch ID: {batch.id}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-border rounded-lg p-3">
      <p className="text-[10px] uppercase text-gray-500">{label}</p>
      <p className="text-xl font-bold text-navy mt-1">{value}</p>
    </div>
  );
}
