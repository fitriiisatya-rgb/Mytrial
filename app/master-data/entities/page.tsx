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
import { saveEntity, toggleEntityActive } from "./actions";

const PAGE_SIZE = 20;
const BASE = "/master-data/entities";

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string; q?: string; page?: string };
}) {
  const { error, edit, q, page: pageParam } = searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase.from("entities").select("*", { count: "exact" }).order("code");
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  const from = (page - 1) * PAGE_SIZE;
  const { data: entities, count } = await query.range(from, from + PAGE_SIZE - 1);

  const editing = edit ? entities?.find((e) => e.id === edit) : null;

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader title="Entitas" description="Perusahaan/badan usaha yang menaungi outlet dan rekening bank." />

      <form action={saveEntity} className="bg-white border border-border rounded-lg p-4 mb-6 flex gap-3 items-end">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <FormField label="Kode" required>
          <input name="code" defaultValue={editing?.code} required className={inputClass} />
        </FormField>
        <div className="flex-1">
          <FormField label="Nama" required>
            <input name="name" defaultValue={editing?.name} required className={inputClass} />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
          <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
          Aktif
        </label>
        <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
          {editing ? "Simpan" : "Tambah"}
        </button>
      </form>

      <SearchFilterBar basePath={BASE} searchQuery={q} searchPlaceholder="Cari kode atau nama entitas…" />

      <DataTable
        columns={[
          {
            header: "Kode",
            cell: (e) => (
              <Link href={`${BASE}/${e.id}`} className="text-navy underline font-medium">
                {e.code}
              </Link>
            ),
          },
          { header: "Nama", cell: (e) => e.name },
          { header: "Status", cell: (e) => <ActiveBadge active={e.active} /> },
          {
            header: "",
            align: "right",
            cell: (e) => (
              <div className="space-x-3">
                <a href={`${BASE}?edit=${e.id}`} className="text-navy underline">
                  Edit
                </a>
                <form action={toggleEntityActive} className="inline">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="active" value={String(e.active)} />
                  <ConfirmSubmitButton
                    confirmMessage={
                      e.active
                        ? `Nonaktifkan entitas "${e.name}"? Data historis tidak akan terhapus.`
                        : `Aktifkan kembali entitas "${e.name}"?`
                    }
                    className="text-gray-500 underline"
                  >
                    {e.active ? "Nonaktifkan" : "Aktifkan"}
                  </ConfirmSubmitButton>
                </form>
              </div>
            ),
          },
        ]}
        rows={entities ?? []}
      />
      <Pagination basePath={BASE} searchParams={{ q }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
