"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface RevenueData {
  total_revenue_stars: number;
  total_transactions: number;
  unique_paying_users: number;
  avg_revenue_per_user: number;
  subscription_revenue: number;
  boost_revenue: number;
  feature_revenue: number;
  ad_revenue: number;
}

export default function AdminRevenuePage() {
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RevenueData | null>(null);
  const [dateRange, setDateRange] = useState("30d");

  const getDates = useCallback(() => {
    const end = new Date().toISOString().split("T")[0];
    const days: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const start = new Date(Date.now() - (days[dateRange] ?? 30) * 86400000).toISOString().split("T")[0];
    return { start, end };
  }, [dateRange]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { start, end } = getDates();
      const res = await fetch(`/api/admin/analytics/revenue?start=${start}&end=${end}`);
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.error ?? "Failed to load revenue data");
    } catch {
      setError("Failed to load revenue data");
    } finally {
      setLoading(false);
    }
  }, [getDates]);

  useEffect(() => {
    if (user && canSync(user.role, Permissions.ANALYTICS_VIEW)) fetchData();
    else setLoading(false);
  }, [user, fetchData]);

  if (!user || !canSync(user.role, Permissions.ANALYTICS_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  const MetricCard = ({ label, value, format = "number" }: { label: string; value: number; format?: string }) => (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
        {format === "currency" ? `⭐ ${value.toLocaleString()}` : value.toLocaleString()}
      </p>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Revenue Analytics</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Revenue summary and reconciliation</p>
        </div>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {loading ? (
        <Loading message="Loading revenue data..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={fetchData} />
      ) : data ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Total Revenue" value={data.total_revenue_stars} format="currency" />
            <MetricCard label="Transactions" value={data.total_transactions} />
            <MetricCard label="Paying Users" value={data.unique_paying_users} />
            <MetricCard label="Avg Revenue/User" value={data.avg_revenue_per_user} format="currency" />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Revenue Breakdown</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Subscriptions" value={data.subscription_revenue} format="currency" />
              <MetricCard label="Boosts" value={data.boost_revenue} format="currency" />
              <MetricCard label="Features" value={data.feature_revenue} format="currency" />
              <MetricCard label="Ad Revenue" value={data.ad_revenue} format="currency" />
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">No revenue data available</div>
      )}
    </div>
  );
}
