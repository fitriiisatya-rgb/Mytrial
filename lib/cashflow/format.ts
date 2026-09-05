import { toSen, formatIDR as formatIDRSen } from "@/lib/money";

/** Format a Rupiah amount (number or NUMERIC string from Postgres) as "Rp 1.250.000.000". A non-breaking space after "Rp" keeps the amount from wrapping onto its own line in a narrow card. */
export function formatRupiah(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "Rp 0";
  return formatIDRSen(toSen(amount)).replace(" ", " ");
}

const JAKARTA_TZ = "Asia/Jakarta";

/** Format an ISO date (yyyy-mm-dd or full timestamp) as "05 Sep 2026", Asia/Jakarta. */
export function formatDateID(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date.length === 10 ? `${date}T00:00:00Z` : date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: JAKARTA_TZ,
  }).format(d);
}

/** Today's date in Asia/Jakarta as yyyy-mm-dd — the app's canonical "today" for filters/projections. */
export function todayJakarta(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonthISO(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0));
  return last.toISOString().slice(0, 10);
}

/** Mask an account number as "**** **** 2227" without storing the full number in the client bundle. */
export function maskAccountNumber(accountNumber: string | null | undefined): string {
  if (!accountNumber) return "-";
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length < 4) return accountNumber;
  return `**** **** ${digits.slice(-4)}`;
}
