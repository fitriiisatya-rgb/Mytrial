import { createClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/components/master-data/error-banner";
import { PageHeader } from "@/components/master-data/page-header";
import { SearchFilterBar } from "@/components/master-data/search-filter-bar";
import { ActiveBadge } from "@/components/master-data/status-badge";
import { ConfirmSubmitButton } from "@/components/master-data/confirm-submit-button";
import { FormField, inputClass } from "@/components/master-data/form-field";
import { saveCoa, toggleCoaActive } from "./actions";
import type { Database } from "@/types/database.types";

type CoaRow = Database["public"]["Tables"]["coa"]["Row"];

const ACCOUNT_TYPES = [
  "asset", "liability", "equity", "revenue", "cogs",
  "operating_expense", "other_income", "other_expense",
] as const;
const PNL_CATEGORIES = ["", "revenue", "cogs", "opex", "other_income", "other_expense"] as const;
const BASE = "/master-data/coa";

function buildChildren(accounts: CoaRow[]) {
  const byParent = new Map<string | null, CoaRow[]>();
  for (const a of accounts) {
    const key = a.parent_id;
    const list = byParent.get(key) ?? [];
    list.push(a);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.reporting_order - b.reporting_order || a.code.localeCompare(b.code));
  }
  return byParent;
}

export default async function CoaPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string; q?: string };
}) {
  const { error, edit, q } = searchParams;
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("coa").select("*").order("code");
  const all = accounts ?? [];
  const editing = edit ? all.find((a) => a.id === edit) : null;

  const filtered = q
    ? all.filter((a) => a.code.toLowerCase().includes(q.toLowerCase()) || a.name.toLowerCase().includes(q.toLowerCase()))
    : null;
  const byParent = buildChildren(all);

  return (
    <div>
      <ErrorBanner message={error} />
      <PageHeader title="Chart of Accounts" description="Struktur akun berjenjang (induk/anak) yang digunakan seluruh jurnal." />

      <form action={saveCoa} className="bg-white border border-border rounded-lg p-4 mb-6 grid grid-cols-4 gap-3">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <FormField label="Kode" required>
          <input name="code" defaultValue={editing?.code} required className={inputClass} />
        </FormField>
        <FormField label="Nama" required span={2}>
          <input name="name" defaultValue={editing?.name} required className={inputClass} />
        </FormField>
        <FormField label="Urutan Laporan">
          <input type="number" name="reporting_order" defaultValue={editing?.reporting_order ?? 0} className={inputClass} />
        </FormField>
        <FormField label="Tipe Akun" required>
          <select name="account_type" defaultValue={editing?.account_type} required className={inputClass}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Saldo Normal" required>
          <select name="normal_balance" defaultValue={editing?.normal_balance} required className={inputClass}>
            <option value="debit">debit</option>
            <option value="credit">credit</option>
          </select>
        </FormField>
        <FormField label="Kategori P&L">
          <select name="pnl_category" defaultValue={editing?.pnl_category ?? ""} className={inputClass}>
            {PNL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c || "— (neraca)"}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Akun Induk">
          <select name="parent_id" defaultValue={editing?.parent_id ?? ""} className={inputClass}>
            <option value="">— (tidak ada)</option>
            {all
              .filter((a) => a.id !== editing?.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
          </select>
        </FormField>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
          Aktif
        </label>
        <div className="col-span-4">
          <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
            {editing ? "Simpan" : "Tambah"}
          </button>
        </div>
      </form>

      <SearchFilterBar basePath={BASE} searchQuery={q} searchPlaceholder="Cari kode atau nama akun… (menonaktifkan tampilan hierarki)" />

      {filtered ? (
        <FlatList accounts={filtered} />
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_100px_80px_60px] gap-2 px-4 py-2 bg-surface text-left text-xs uppercase text-gray-500">
            <span>Kode / Nama</span>
            <span>Tipe</span>
            <span>Saldo Normal</span>
            <span>Status</span>
            <span></span>
          </div>
          <CoaTree parentId={null} byParent={byParent} depth={0} />
        </div>
      )}
    </div>
  );
}

function CoaTree({
  parentId,
  byParent,
  depth,
}: {
  parentId: string | null;
  byParent: Map<string | null, CoaRow[]>;
  depth: number;
}) {
  const children = byParent.get(parentId) ?? [];
  if (children.length === 0) return null;

  return (
    <>
      {children.map((a) => (
        <div key={a.id}>
          <div className="grid grid-cols-[1fr_100px_100px_80px_60px] gap-2 px-4 py-2 border-t border-border text-sm items-center">
            <span style={{ paddingLeft: depth * 20 }}>
              <span className="text-gray-400 mr-2">{a.code}</span>
              {a.name}
            </span>
            <span className="text-xs text-gray-600">{a.account_type}</span>
            <span className="text-xs text-gray-600">{a.normal_balance}</span>
            <ActiveBadge active={a.active} />
            <div className="text-right space-x-2">
              <a href={`${BASE}?edit=${a.id}`} className="text-navy underline text-xs">
                Edit
              </a>
              <form action={toggleCoaActive} className="inline">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="active" value={String(a.active)} />
                <ConfirmSubmitButton
                  confirmMessage={a.active ? `Nonaktifkan akun "${a.name}"?` : `Aktifkan kembali akun "${a.name}"?`}
                  className="text-gray-500 underline text-xs"
                >
                  {a.active ? "Nonaktifkan" : "Aktifkan"}
                </ConfirmSubmitButton>
              </form>
            </div>
          </div>
          <CoaTree parentId={a.id} byParent={byParent} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}

function FlatList({ accounts }: { accounts: CoaRow[] }) {
  if (accounts.length === 0) {
    return <div className="bg-white border border-border rounded-lg px-4 py-10 text-center text-sm text-gray-400">Tidak ditemukan.</div>;
  }
  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_100px_100px_80px_60px] gap-2 px-4 py-2 bg-surface text-left text-xs uppercase text-gray-500">
        <span>Kode / Nama</span>
        <span>Tipe</span>
        <span>Saldo Normal</span>
        <span>Status</span>
        <span></span>
      </div>
      {accounts.map((a) => (
        <div key={a.id} className="grid grid-cols-[1fr_100px_100px_80px_60px] gap-2 px-4 py-2 border-t border-border text-sm items-center">
          <span>
            <span className="text-gray-400 mr-2">{a.code}</span>
            {a.name}
          </span>
          <span className="text-xs text-gray-600">{a.account_type}</span>
          <span className="text-xs text-gray-600">{a.normal_balance}</span>
          <ActiveBadge active={a.active} />
          <div className="text-right space-x-2">
            <a href={`${BASE}?edit=${a.id}`} className="text-navy underline text-xs">
              Edit
            </a>
            <form action={toggleCoaActive} className="inline">
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="active" value={String(a.active)} />
              <ConfirmSubmitButton
                confirmMessage={a.active ? `Nonaktifkan akun "${a.name}"?` : `Aktifkan kembali akun "${a.name}"?`}
                className="text-gray-500 underline text-xs"
              >
                {a.active ? "Nonaktifkan" : "Aktifkan"}
              </ConfirmSubmitButton>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
