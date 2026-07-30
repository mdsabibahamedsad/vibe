"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const TABS = [
  { label: "Dashboard", href: "/admin/analytics" },
  { label: "Funnels", href: "/admin/analytics/funnels" },
  { label: "Retention", href: "/admin/analytics/retention" },
  { label: "Experiments", href: "/admin/analytics/experiments" },
  { label: "Revenue", href: "/admin/analytics/revenue" },
  { label: "Data Quality", href: "/admin/analytics/data-quality" },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col min-h-full">
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
