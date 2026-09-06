import Link from "next/link";

function hrefFor(basePath: string, params: Record<string, string | undefined>, page: number) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") usp.set(k, v);
  }
  usp.set("page", String(page));
  return `${basePath}?${usp.toString()}`;
}

export function Pagination({
  basePath,
  searchParams,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex justify-between items-center mt-3 text-sm text-gray-500">
      <span>
        {total} data — halaman {page} dari {totalPages}
      </span>
      <div className="flex gap-2">
        <Link
          href={hrefFor(basePath, searchParams, Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={`px-3 py-1 rounded-lg border border-border ${
            page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface"
          }`}
        >
          ‹ Sebelumnya
        </Link>
        <Link
          href={hrefFor(basePath, searchParams, Math.min(totalPages, page + 1))}
          aria-disabled={page >= totalPages}
          className={`px-3 py-1 rounded-lg border border-border ${
            page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface"
          }`}
        >
          Berikutnya ›
        </Link>
      </div>
    </div>
  );
}
