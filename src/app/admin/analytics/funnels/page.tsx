"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";
import type { FunnelStep } from "@/lib/analytics/funnels";

const FUNNELS: Array<{ id: string; name: string; endpoint: string }> = [
  { id: "onboarding", name: "Onboarding", endpoint: "onboarding" },
  { id: "dating", name: "Dating", endpoint: "dating" },
  { id: "content", name: "Content", endpoint: "content" },
  { id: "premium", name: "Premium", endpoint: "premium" },
];

export default function AdminFunnelsPage() {
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnels, setFunnels] = useState<Record<string, FunnelStep[]>>({});
  const [selectedFunnel, setSelectedFunnel] = useState("onboarding");
  const [dateRange, setDateRange] = useState("30d");

  const getDates = useCallback(() => {
    const end = new Date().toISOString().split("T")[0];
    const days: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const start = new Date(Date.now() - (days[dateRange] ?? 30) * 86400000).toISOString().split("T")[0];
    return { start, end };
  }, [dateRange]);

  const fetchFunnels = useCallback(async () => {
    try {
      setLoading(true);
      const { start, end } = getDates();
      const results: Record<string, FunnelStep[]> = {};

      for (const funnel of FUNNELS) {
        const res = await fetch(`/api/admin/analytics/funnel?type=${funnel.endpoint}&start=${start}&end=${end}`);
        const json = await res.json();
        if (json.success) {
          results[funnel.id] = json.data ?? [];
        }
      }

      setFunnels(results);
    } catch {
      setError("Failed to load funnels");
    } finally {
      setLoading(false);
    }
  }, [getDates]);

  useEffect(() => {
    if (user && canSync(user.role, Permissions.ANALYTICS_VIEW)) {
      fetchFunnels();
    } else {
      setLoading(false);
    }
  }, [user, fetchFunnels]);

  if (!user || !canSync(user.role, Permissions.ANALYTICS_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  const currentSteps = funnels[selectedFunnel] ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Funnel Analytics</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Conversion funnels for key user journeys
          </p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="flex gap-2 mb-6">
        {FUNNELS.map((f) => (
          <button
            key={f.id}
            onClick={() => setSelectedFunnel(f.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              selectedFunnel === f.id
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading message="Loading funnels..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={fetchFunnels} />
      ) : currentSteps.length > 0 ? (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Step</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Event</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Users</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Conversion</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Drop-off</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {currentSteps.map((step) => (
                <tr key={step.step} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-gray-400">{step.step}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{step.eventName}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-mono">
                    {step.uniqueUsers.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono ${step.conversionFromFirst > 50 ? "text-green-600" : "text-amber-600"}`}>
                      {step.conversionFromFirst}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono ${step.dropoffFromPrevious > 50 ? "text-red-600" : "text-gray-600"}`}>
                      {step.dropoffFromPrevious}%
                    </span>
                  </td>
                </tr>
              ))}
              {/* Summary row */}
              <tr className="bg-gray-50 dark:bg-gray-800/50 font-medium">
                <td colSpan={4} className="px-4 py-3 text-gray-500">Overall conversion (first → last)</td>
                <td className="px-4 py-3 text-right font-mono text-blue-600">
                  {currentSteps.length > 1
                    ? `${currentSteps[currentSteps.length - 1].conversionFromFirst}%`
                    : "100%"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">No funnel data available for this period</div>
      )}
    </div>
  );
}
