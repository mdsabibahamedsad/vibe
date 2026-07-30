"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canAccessAdmin, isModeratorRole, canSync, Permissions } from "@/lib/admin/permissions";
import { Loading } from "@/components/ui";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: string; // Optional permission required
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/admin", icon: "📊" },
  { label: "Safety", href: "/admin/safety", icon: "🛡️", permission: Permissions.REPORTS_VIEW },
  { label: "Reports", href: "/admin/reports", icon: "🚨", permission: Permissions.REPORTS_VIEW },
  { label: "Users", href: "/admin/users", icon: "👥", permission: Permissions.USERS_VIEW },
  { label: "Content", href: "/admin/content", icon: "📝", permission: Permissions.CONTENT_VIEW },
  { label: "Appeals", href: "/admin/appeals", icon: "⚖️", permission: Permissions.APPEALS_VIEW },
  { label: "Analytics", href: "/admin/analytics", icon: "📈", permission: Permissions.ANALYTICS_VIEW },
  { label: "Billing", href: "/admin/billing", icon: "💳", permission: Permissions.BILLING_VIEW },
  { label: "Ads", href: "/admin/ads", icon: "📢", permission: Permissions.ADS_VIEW },
  { label: "Translations", href: "/admin/translations", icon: "🌐", permission: Permissions.ADMIN_MANAGE },
  { label: "Audit Log", href: "/admin/audit", icon: "📋", permission: Permissions.AUDIT_VIEW },
  { label: "Admins", href: "/admin/admins", icon: "🔐", permission: Permissions.ADMIN_MANAGE },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, authenticated, loading } = useCurrentUser();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!authenticated || !user) {
      router.push("/");
      return;
    }

    if (!canAccessAdmin(user.role)) {
      router.push("/");
      return;
    }

    setAuthorized(true);
    setChecking(false);
  }, [loading, authenticated, user, router]);

  if (checking || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loading message="Verifying access..." />
      </div>
    );
  }

  if (!authorized) return null;

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.permission || canSync(user!.role, item.permission as any),
  );

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Admin header */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-white">Vibe Admin</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {user?.role?.replace("_", " ")}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {visibleNavItems.map((item) => (
            <button
              key={item.href}
              onClick={() => {
                router.push(item.href);
                setSidebarOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href + "/"))
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <button
            onClick={() => router.push("/")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <span>←</span>
            Back to App
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Vibe Admin</h1>
            <p className="text-xs text-gray-500 capitalize">{user?.role?.replace("_", " ")}</p>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
