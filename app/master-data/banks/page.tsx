import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { DataTable } from "@/components/master-data/data-table";
import { Pagination } from "@/components/master-data/pagination";
import { SearchFilterBar } from "@/components/master-data/search-filter-bar";
import { ActiveBadge } from "@/components/master-data/status-badge";
import { ConfirmSubmitButton } from "@/components/master-data/confirm-submit-button";
import { FormField, inputClass } from "@/components/master-data/form-field";
import { canWrite, getCurrentRole } from "@/lib/supabase/permissions";
import { saveBank, toggleBankActive } from "./actions";

const PAGE_SIZE = 20;
const BASE = "/master-data/banks";

export default async function BanksPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string; q?: string; page?: string; entity?: string };
}) {
  const { error, edit, q, page: pageParam, entity } = searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase.from("banks").select("*, entities(name), coa(code, name)", { count: "exact" }).order("bank_name");
  if (q) query = query.or(`bank_name.ilike.%${q}%,account_no.ilike.%${q}%,account_name.ilike.%${q}%`);
  if (entity) query = query.eq("entity_id", entity);
  const from = (page - 1) * PAGE_SIZE;
  const { data: banks, count } = await query.range(from, from + PAGE_SIZE - 1);

  const [{ data: entities }, { data: coaOptions }] = await Promise.all([
    supabase.from("entities").select("id, name").eq("active", true).order("name"),
    supabase.from("coa").select("id, code, name").eq("account_type", "asset").eq("active", true).order("code"),
  ]);
  const editing = edit ? banks?.find((b) => b.id === edit) : null;
  const role = await getCurrentRole(supabase);
  const canEdit = canWrite(role, "banks");

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader
        title="Rekening Bank"
        description='Setiap rekening wajib memiliki COA sendiri (Koreksi #1) — jurnal pengeluaran mengkredit akun ini, tidak pernah akun kas/bank generik.'
      />

      {canEdit ? (
        <form action={saveBank} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-3 gap-3">
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
          <FormField label="Nama Bank" required>
            <input name="bank_name" defaultValue={editing?.bank_name} required className={inputClass} />
          </FormField>
          <FormField label="No. Rekening" required>
            <input name="account_no" defaultValue={editing?.account_no} required className={inputClass} />
          </FormField>
          <FormField label="Nama Pemilik Rekening" required>
            <input name="account_name" defaultValue={editing?.account_name} required className={inputClass} />
          </FormField>
          <FormField label="COA Khusus Rekening Ini" required span={2}>
            <select name="coa_id" defaultValue={editing?.coa_id} required className={inputClass}>
              <option value="">Pilih akun COA…</option>
              {coaOptions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
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
      ) : (
        <p className="text-xs text-gray-400 mb-4">
          Peran Anda tidak memiliki izin mengelola rekening bank — hanya dapat melihat daftar di bawah.
        </p>
      )}

      <SearchFilterBar
        basePath={BASE}
        searchQuery={q}
        searchPlaceholder="Cari nama bank atau no. rekening…"
        filters={[
          {
            name: "entity",
            label: "Semua Entitas",
            defaultValue: entity,
            options: (entities ?? []).map((e) => ({ value: e.id, label: e.name })),
          },
        ]}
      />

      <DataTable
        columns={[
          {
            header: "Bank",
            cell: (b) => (
              <Link href={`${BASE}/${b.id}`} className="text-navy underline font-medium">
                {b.bank_name}
              </Link>
            ),
          },
          { header: "No. Rekening", cell: (b) => b.account_no },
          { header: "Entitas", cell: (b) => b.entities?.name ?? "—" },
          { header: "COA", cell: (b) => `${b.coa?.code} — ${b.coa?.name}` },
          { header: "Status", cell: (b) => <ActiveBadge active={b.active} /> },
          {
            header: "",
            align: "right",
            cell: (b) =>
              canEdit ? (
                <div className="space-x-3">
                  <a href={`${BASE}?edit=${b.id}`} className="text-navy underline">
                    Edit
                  </a>
                  <form action={toggleBankActive} className="inline">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="active" value={String(b.active)} />
                    <ConfirmSubmitButton
                      confirmMessage={
                        b.active
                          ? `Nonaktifkan rekening "${b.bank_name} — ${b.account_no}"?`
                          : `Aktifkan kembali rekening "${b.bank_name} — ${b.account_no}"?`
                      }
                      className="text-gray-500 underline"
                    >
                      {b.active ? "Nonaktifkan" : "Aktifkan"}
                    </ConfirmSubmitButton>
                  </form>
                </div>
              ) : null,
          },
        ]}
        rows={banks ?? []}
      />
      <Pagination basePath={BASE} searchParams={{ q, entity }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
