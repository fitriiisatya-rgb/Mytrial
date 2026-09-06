const VARIANTS = {
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-gray-100 text-gray-600 border-gray-200",
} as const;

export function StatusBadge({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${VARIANTS[variant]}`}>
      {label}
    </span>
  );
}

/** active/inactive is the same everywhere — keeps the badge below the same PASS/FAIL color everywhere it's used. */
export function ActiveBadge({ active }: { active: boolean }) {
  return <StatusBadge label={active ? "Aktif" : "Nonaktif"} variant={active ? "success" : "neutral"} />;
}

/** Ownership-total badge: exactly 100 = valid, under = warning (incomplete), over should never reach the UI (the DB guard rejects it first) but is rendered as danger defensively. */
export function OwnershipBadge({ totalPct }: { totalPct: number }) {
  if (totalPct > 100) return <StatusBadge label={`${totalPct}% — Invalid`} variant="danger" />;
  if (totalPct === 100) return <StatusBadge label="100% Valid" variant="success" />;
  return <StatusBadge label={`${totalPct}% — Belum Lengkap`} variant="warning" />;
}

/** profile_id is deliberately never auto-created from master-data CRUD
 * (that's a Phase 3 invite flow) — this badge is what tells accounting an
 * investor genuinely has no login yet vs. one that does. */
export function LoginStatusBadge({ hasProfile }: { hasProfile: boolean }) {
  return hasProfile ? (
    <StatusBadge label="Aktif" variant="success" />
  ) : (
    <StatusBadge label="Belum memiliki akun login" variant="neutral" />
  );
}
