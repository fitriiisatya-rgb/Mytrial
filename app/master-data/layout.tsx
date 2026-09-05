import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/current-profile";
import { SignOutButton } from "../sign-out-button";

const TABS = [
  { href: "/master-data/entities", label: "Entitas" },
  { href: "/master-data/outlets", label: "Outlet" },
  { href: "/master-data/coa", label: "Chart of Accounts" },
  { href: "/master-data/banks", label: "Rekening Bank" },
  { href: "/master-data/investors", label: "Investor" },
  { href: "/master-data/contracts", label: "Kontrak Kemitraan" },
  { href: "/master-data/ownerships", label: "Kepemilikan" },
];

export default async function MasterDataLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { profile } = await requireProfile(supabase);

  return (
    <main className="min-h-screen">
      <div className="border-b border-border bg-white px-8 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-navy">Master Data</h1>
          <p className="text-xs text-gray-500">
            {profile.full_name} — {profile.role}
          </p>
        </div>
        <SignOutButton />
      </div>
      <nav className="border-b border-border bg-white px-8 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-3 py-2 text-sm text-gray-600 hover:text-navy hover:border-b-2 hover:border-gold whitespace-nowrap"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="p-8">{children}</div>
    </main>
  );
}
