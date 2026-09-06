export const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-sm";

// Tailwind's content scanner only picks up literal class strings, never a
// runtime template like `col-span-${span}` — this map is what makes the
// `span` prop below actually generate the right CSS.
const SPAN_CLASS = { 1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4" } as const;

export function FormField({
  label,
  required,
  span,
  children,
}: {
  label: string;
  required?: boolean;
  span?: 1 | 2 | 3 | 4;
  children: React.ReactNode;
}) {
  return (
    <div className={span ? SPAN_CLASS[span] : undefined}>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
