"use client";

import { useEffect, useState } from "react";
import { Loading } from "@/components/ui";

interface DashboardData {
  overview: Record<string, number>;
  recentEscalations: any[];
  metrics: any[];
  lastRefreshed: string;
}

export default function AdminSafetyDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/safety/dashboard");
      if (!res.ok) throw new Error("Failed to load safety data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading message="Loading safety dashboard..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          <h3 className="font-semibold">Failed to load</h3>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 text-sm font-medium underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const overview = data?.overview ?? {};
  const escalations = data?.recentEscalations ?? [];

  const metricCards = [
    { label: "Open Escalations", value: overview.open_escalations ?? 0, color: "text-red-600" },
    { label: "Pending Reports", value: overview.pending_reports ?? 0, color: "text-amber-600" },
    { label: "Scam Signals (24h)", value: overview.scam_signals_24h ?? 0, color: "text-orange-600" },
    { label: "Harassment Reports (24h)", value: overview.harassment_reports_24h ?? 0, color: "text-purple-600" },
    { label: "Impersonation Reports", value: overview.impersonation_reports ?? 0, color: "text-blue-600" },
    { label: "Appeals Pending", value: overview.pending_appeals ?? 0, color: "text-teal-600" },
    { label: "Active Restrictions", value: overview.active_restrictions ?? 0, color: "text-gray-600" },
    { label: "Safety Warnings (24h)", value: overview.safety_warnings_24h ?? 0, color: "text-indigo-600" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🛡️ Safety Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Trust & safety metrics and escalation queue
          </p>
        </div>
        <button
          onClick={fetchData}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <a
          href="/admin/reports"
          className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white">🚨 Reports</h3>
          <p className="text-sm text-gray-500 mt-1">Review and resolve user reports</p>
        </a>
        <a
          href="/admin/appeals"
          className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white">⚖️ Appeals</h3>
          <p className="text-sm text-gray-500 mt-1">Review moderation appeals</p>
        </a>
        <a
          href="/admin/safety/escalations"
          className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white">🔴 Escalations</h3>
          <p className="text-sm text-gray-500 mt-1">Handle critical safety escalations</p>
        </a>
      </div>

      {/* Recent Escalations */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Recent Escalations
        </h2>

        {escalations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No open escalations. 🎉</p>
          </div>
        ) : (
          <div className="space-y-3">
            {escalations.map((esc: any) => (
              <div
                key={esc.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {esc.category?.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {esc.description?.substring(0, 100)}
                  </p>
                </div>
                <span
                  className={`ml-3 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    esc.priority === "critical"
                      ? "bg-red-100 text-red-700"
                      : esc.priority === "high"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {esc.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Last refreshed */}
      {data?.lastRefreshed && (
        <p className="text-xs text-gray-400 mt-4 text-center">
          Last refreshed: {new Date(data.lastRefreshed).toLocaleString()}
        </p>
      )}
    </div>
  );
}
