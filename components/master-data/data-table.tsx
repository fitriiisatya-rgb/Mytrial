import { EmptyState } from "./empty-state";

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage = "Belum ada data, atau Anda tidak memiliki akses ke data ini.",
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
}) {
  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase text-gray-500">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`px-4 py-2 whitespace-nowrap ${c.align === "right" ? "text-right" : ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border hover:bg-surface/60">
              {columns.map((c, i) => (
                <td key={i} className={`px-4 py-2 ${c.align === "right" ? "text-right" : ""}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState message={emptyMessage} />}
    </div>
  );
}
