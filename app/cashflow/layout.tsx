import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import { SignOutButton } from "../sign-out-button";

const NAV = [
  { href: "/cashflow/dashboard", label: "Dashboard" },
  { href: "/cashflow/accounts", label: "Rekening" },
  { href: "/cashflow/transactions", label: "Transaksi" },
  { href: "/cashflow/plan", label: "Rencana Cashflow" },
  { href: "/cashflow/calendar", label: "Kalender Cashflow" },
  { href: "/cashflow/payment", label: "Jadwal Pembayaran" },
  { href: "/cashflow/reports", label: "Laporan" },
  { href: "/cashflow/settings", label: "Pengaturan" },
];

export default async function CashflowLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { profile } = await requireCashflowAccess(supabase);

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-navy text-white flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-sm font-bold tracking-wide text-gold">CASHFLOW</div>
          <div className="text-[11px] text-white/60">Amor Group</div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-5 py-2.5 text-sm text-white/80 hover:bg-navy-2 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-xs text-white/60">
          <div className="font-medium text-white/90">{profile.full_name}</div>
          <div>{profile.role}</div>
          <div className="mt-2">
            <SignOutButton className="text-xs text-white/60 hover:text-white underline" />
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-surface">{children}</main>
    </div>
  );
}
