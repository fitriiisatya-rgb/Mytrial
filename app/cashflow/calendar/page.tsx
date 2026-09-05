import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { PageHeader } from "@/components/cashflow/page-header";
import { formatRupiah, formatDateID, todayJakarta } from "@/lib/cashflow/format";

function monthBounds(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const last = new Date(Date.UTC(y!, m!, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10), year: y!, month: m! };
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: { month?: string; date?: string } }) {
  const supabase = await createClient();
  await requireCashflowAccess(supabase);

  const today = todayJakarta();
  const monthKey = searchParams.month ?? today.slice(0, 7);
  const { from, to, year, month } = monthBounds(monthKey);

  const [{ data: plans }, { data: payments }] = await Promise.all([
    supabase.from("planned_cashflows").select("plan_date, type, amount, description").gte("plan_date", from).lte("plan_date", to).neq("status", "CANCELLED"),
    supabase.from("payment_schedules").select("due_date, payee, amount, status").gte("due_date", from).lte("due_date", to).neq("status", "CANCELLED"),
  ]);

  const byDay = new Map<string, { cashIn: number; cashOut: number; payments: number }>();
  for (const p of plans ?? []) {
    const entry = byDay.get(p.plan_date) ?? { cashIn: 0, cashOut: 0, payments: 0 };
    if (p.type === "CASH_IN") entry.cashIn += Number(p.amount);
    else entry.cashOut += Number(p.amount);
    byDay.set(p.plan_date, entry);
  }
  for (const p of payments ?? []) {
    const entry = byDay.get(p.due_date) ?? { cashIn: 0, cashOut: 0, payments: 0 };
    entry.payments += Number(p.amount);
    byDay.set(p.due_date, entry);
  }

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
  const leadingBlanks = (firstWeekday + 6) % 7; // make Monday first
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`)];

  const selectedDate = searchParams.date;
  const selectedPlans = selectedDate ? (plans ?? []).filter((p) => p.plan_date === selectedDate) : [];
  const selectedPayments = selectedDate ? (payments ?? []).filter((p) => p.due_date === selectedDate) : [];

  return (
    <div>
      <PageHeader
        title="Cashflow Calendar"
        description="Rencana cash in/out dan jadwal pembayaran per tanggal."
        actions={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/cashflow/calendar?month=${shiftMonth(monthKey, -1)}`} className="px-2 py-1 border border-border rounded-md">
              ←
            </Link>
            <span className="font-semibold text-navy">
              {new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)))}
            </span>
            <Link href={`/cashflow/calendar?month=${shiftMonth(monthKey, 1)}`} className="px-2 py-1 border border-border rounded-md">
              →
            </Link>
          </div>
        }
      />
      <div className="p-8">
        <div className="grid grid-cols-7 gap-2 text-xs text-gray-400 mb-1 px-1">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const entry = byDay.get(date);
            const isToday = date === today;
            return (
              <Link
                key={date}
                href={`/cashflow/calendar?month=${monthKey}&date=${date}`}
                className={`border rounded-lg p-2 h-24 flex flex-col justify-between text-xs hover:border-navy ${
                  date === selectedDate ? "border-navy bg-navy/5" : "border-border bg-white"
                } ${isToday ? "ring-1 ring-gold" : ""}`}
              >
                <div className="font-semibold text-gray-600">{Number(date.slice(-2))}</div>
                <div className="space-y-0.5">
                  {entry?.cashIn ? <div className="text-emerald-600">+{formatRupiah(entry.cashIn)}</div> : null}
                  {entry?.cashOut ? <div className="text-red-600">-{formatRupiah(entry.cashOut)}</div> : null}
                  {entry?.payments ? <div className="text-amber-600">Payment: {formatRupiah(entry.payments)}</div> : null}
                </div>
              </Link>
            );
          })}
        </div>

        {selectedDate && (
          <div className="mt-6 bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-navy mb-3">Detail {formatDateID(selectedDate)}</h3>
            {selectedPlans.length === 0 && selectedPayments.length === 0 && (
              <p className="text-sm text-gray-400">Tidak ada rencana/jadwal pada tanggal ini.</p>
            )}
            <ul className="space-y-2 text-sm">
              {selectedPlans.map((p, i) => (
                <li key={`plan-${i}`} className="flex justify-between">
                  <span>{p.description || (p.type === "CASH_IN" ? "Rencana Cash In" : "Rencana Cash Out")}</span>
                  <span className={p.type === "CASH_IN" ? "text-emerald-600" : "text-red-600"}>{formatRupiah(p.amount)}</span>
                </li>
              ))}
              {selectedPayments.map((p, i) => (
                <li key={`pay-${i}`} className="flex justify-between">
                  <span>Payment: {p.payee}</span>
                  <span className="text-amber-600">{formatRupiah(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
