"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface DashboardMetrics {
  new_users_today: number;
  open_reports: number;
  critical_reports: number;
  banned_users: number;
  suspended_users: number;
  pending_appeals: number;
  unreviewed_flags?: number;
  reports_today?: number;
  content_removed_today?: number;
  active_users_today?: number;
}

export default function AdminDashboard() {
  const { user } = useCurrentUser();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  async function fetchMetrics() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/dashboard");
      const json = await res.json();
      if (json.success) {
        setMetrics(json.data);
      } else {
        setError(json.error ?? "Failed to load metrics");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <Loading message="Loading dashboard..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState title="Dashboard Error" message={error} onRetry={fetchMetrics} />
      </div>
    );
  }

  const cards = [
    {
      label: "New Users Today",
      value: metrics?.new_users_today ?? 0,
      color: "bg-blue-500",
      permission: Permissions.USERS_VIEW,
    },
    {
      label: "Open Reports",
      value: metrics?.open_reports ?? 0,
      color: metrics && metrics.critical_reports > 0 ? "bg-red-500" : "bg-amber-500",
      permission: Permissions.REPORTS_VIEW,
    },
    {
      label: "Critical Reports",
      value: metrics?.critical_reports ?? 0,
      color: "bg-red-600",
      permission: Permissions.REPORTS_VIEW,
    },
    {
      label: "Banned Users",
      value: metrics?.banned_users ?? 0,
      color: "bg-gray-700",
      permission: Permissions.USERS_VIEW,
    },
    {
      label: "Suspended Users",
      value: metrics?.suspended_users ?? 0,
      color: "bg-orange-500",
      permission: Permissions.USERS_VIEW,
    },
    {
      label: "Pending Appeals",
      value: metrics?.pending_appeals ?? 0,
      color: "bg-purple-500",
      permission: Permissions.APPEALS_VIEW,
    },
  ];

  const allowedCards = cards.filter(
    (card) => !card.permission || (user && canSync(user.role, card.permission as any)),
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Welcome to the Vibe moderation control center.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {allowedCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {card.label}
                </p>
                <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">
                  {card.value}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full ${card.color} bg-opacity-20 flex items-center justify-center`}>
                <span className={`text-lg font-bold ${card.color.replace("bg-", "text-")}`}>
                  {card.value}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {user && canSync(user.role, Permissions.REPORTS_VIEW) && (
            <a
              href="/admin/reports"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 px-4 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              🚨 View Reports
            </a>
          )}
          {user && canSync(user.role, Permissions.APPEALS_VIEW) && (
            <a
              href="/admin/appeals"
              className="inline-flex items-center gap-2 rounded-lg bg-purple-50 dark:bg-purple-900/30 px-4 py-2.5 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
            >
              ⚖️ Review Appeals
            </a>
          )}
          {user && canSync(user.role, Permissions.CONTENT_VIEW) && (
            <a
              href="/admin/content"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            >
              📝 Moderate Content
            </a>
          )}
          {user && canSync(user.role, Permissions.ADMIN_MANAGE) && (
            <a
              href="/admin/admins"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-700/30 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              🔐 Manage Admins
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
