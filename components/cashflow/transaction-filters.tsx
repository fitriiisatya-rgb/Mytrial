export interface FilterOption {
  id: string;
  name: string;
}

export function TransactionFilterBar({
  action,
  accounts,
  categories,
  values,
  showAccountFilter = true,
}: {
  action: string;
  accounts?: FilterOption[];
  categories: FilterOption[];
  values: { dateFrom?: string; dateTo?: string; bankAccountId?: string; categoryId?: string; transactionType?: string; keyword?: string };
  showAccountFilter?: boolean;
}) {
  return (
    <form action={action} method="get" className="bg-white border border-border rounded-lg p-4 mb-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Dari</label>
        <input type="date" name="from" defaultValue={values.dateFrom} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Sampai</label>
        <input type="date" name="to" defaultValue={values.dateTo} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
      </div>
      {showAccountFilter && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Rekening</label>
          <select name="account" defaultValue={values.bankAccountId ?? ""} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm">
            <option value="">Semua</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Kategori</label>
        <select name="category" defaultValue={values.categoryId ?? ""} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm">
          <option value="">Semua</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipe</label>
        <select name="type" defaultValue={values.transactionType ?? ""} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm">
          <option value="">Semua</option>
          <option value="CASH_IN">Cash In</option>
          <option value="CASH_OUT">Cash Out</option>
          <option value="INTERNAL_TRANSFER_IN">Transfer In</option>
          <option value="INTERNAL_TRANSFER_OUT">Transfer Out</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cari</label>
        <input
          type="text"
          name="q"
          defaultValue={values.keyword}
          placeholder="Deskripsi..."
          className="w-full border border-border rounded-lg px-2 py-1.5 text-sm"
        />
      </div>
      <div className="col-span-2 md:col-span-6 flex justify-end gap-2">
        <button type="submit" className="bg-navy text-white rounded-lg px-4 py-1.5 text-sm font-semibold">
          Filter
        </button>
      </div>
    </form>
  );
}

export function Pagination({ baseHref, page, pageSize, total }: { baseHref: string; page: number; pageSize: number; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const makeHref = (p: number) => {
    const url = new URL(baseHref, "https://placeholder.local");
    url.searchParams.set("page", String(p));
    return `${url.pathname}?${url.searchParams.toString()}`;
  };

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
      <div>
        Halaman {page} dari {totalPages} — {total.toLocaleString("id-ID")} transaksi
      </div>
      <div className="flex gap-2">
        <a
          href={page > 1 ? makeHref(page - 1) : undefined}
          aria-disabled={page <= 1}
          className={`px-3 py-1.5 rounded-md border border-border ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface"}`}
        >
          ← Sebelumnya
        </a>
        <a
          href={page < totalPages ? makeHref(page + 1) : undefined}
          aria-disabled={page >= totalPages}
          className={`px-3 py-1.5 rounded-md border border-border ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface"}`}
        >
          Berikutnya →
        </a>
      </div>
    </div>
  );
}
