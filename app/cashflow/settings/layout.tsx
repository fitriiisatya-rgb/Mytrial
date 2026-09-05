import Link from "next/link";

const TABS = [
  { href: "/cashflow/settings/accounts", label: "Bank Accounts" },
  { href: "/cashflow/settings/categories", label: "Categories" },
  { href: "/cashflow/settings/sync", label: "Google Sheet Sync" },
  { href: "/cashflow/settings/alerts", label: "Alert Threshold" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-border bg-white px-8 py-5">
        <h1 className="text-lg font-bold text-navy">Settings</h1>
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
    </div>
  );
}
