"use client";

import { useRef } from "react";

export interface FilterOption {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}

/** GET form — no client JS required for the search text (Enter submits
 * natively); filters additionally auto-submit on change so choosing one
 * is a single click, not click-then-"Terapkan". */
export function SearchFilterBar({
  basePath,
  searchQuery,
  searchPlaceholder = "Cari…",
  filters = [],
}: {
  basePath: string;
  searchQuery?: string;
  searchPlaceholder?: string;
  filters?: FilterOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={basePath} method="get" className="flex flex-wrap gap-2 mb-4">
      <input
        type="search"
        name="q"
        defaultValue={searchQuery}
        placeholder={searchPlaceholder}
        className="border border-border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
      />
      {filters.map((f) => (
        <select
          key={f.name}
          name={f.name}
          defaultValue={f.defaultValue ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
          className="border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      <button type="submit" className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold">
        Cari
      </button>
    </form>
  );
}
