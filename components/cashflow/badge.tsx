const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-gray-100 text-gray-600",
  positive: "bg-emerald-50 text-emerald-700",
  negative: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-blue-50 text-blue-700",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof TONE_CLASSES }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASSES[tone]}`}>{children}</span>;
}
