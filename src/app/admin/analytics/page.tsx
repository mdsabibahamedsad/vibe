"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface DashboardMetrics {
  overview: Record<string, number>;
  engagement: Record<string, number>;
  monetization: Record<string, number>;
  safety: Record<string, number>;
  growth: Record<string, number>;
  lastRefreshed: string;
}

export default function AdminAnalyticsPage() {
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState("7d");

  const getDates = useCallback(() => {
    const end = new Date().toISOString().split("T")[0];
    const days: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const start = new Date(Date.now() - (days[dateRange] ?? 7) * 86400000).toISOString().split("T")[0];
    return { start, end };
  }, [dateRange]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { start, end } = getDates();
      const res = await fetch(`/api/admin/analytics/dashboard?start=${start}&end=${end}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error ?? "Failed to load analytics");
      }
    } catch {
      setError("Failed to load analytics dashboard");
    } finally {
      setLoading(false);
    }
  }, [getDates]);

  useEffect(() => {
    if (user && canSync(user.role, Permissions.ANALYTICS_VIEW)) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [user, fetchData]);

  if (!user || !canSync(user.role, Permissions.ANALYTICS_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  const MetricCard = ({ label, value, format = "number" }: { label: string; value: number; format?: string }) => (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
        {format === "currency" ? `⭐ ${value.toLocaleString()}` :
         format === "percent" ? `${value}%` :
         value.toLocaleString()}
      </p>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {data?.lastRefreshed ? `Last refreshed: ${new Date(data.lastRefreshed).toLocaleString()}` : "Business Intelligence Dashboard"}
          </p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {loading ? (
        <Loading message="Loading analytics..." />
      ) : error ? (
        <ErrorState title="Analytics Error" message={error} onRetry={fetchData} />
      ) : data ? (
        <div className="space-y-8">
          {/* Overview */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="DAU" value={data.overview.dau ?? 0} />
              <MetricCard label="MAU" value={data.overview.mau ?? 0} />
              <MetricCard label="Total Events" value={data.overview.total_events ?? 0} />
              <MetricCard label="Active Users" value={data.overview.active_users ?? 0} />
            </div>
          </section>

          {/* Growth */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Growth</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="New Users" value={data.growth.new_users ?? 0} />
              <MetricCard label="Signup Conversion" value={data.growth.signup_conversion ?? 0} format="percent" />
              <MetricCard label="Premium Conversion" value={data.growth.premium_conversion ?? 0} format="percent" />
            </div>
          </section>

          {/* Engagement */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Engagement</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Messages Sent" value={data.engagement.total_messages ?? 0} />
              <MetricCard label="Likes Sent" value={data.engagement.total_likes ?? 0} />
              <MetricCard label="Matches" value={data.engagement.total_matches ?? 0} />
              <MetricCard label="Posts Created" value={data.engagement.total_posts ?? 0} />
            </div>
          </section>

          {/* Monetization */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Monetization</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Revenue" value={data.monetization.revenue_stars ?? 0} format="currency" />
              <MetricCard label="Paying Users" value={data.monetization.paying_users ?? 0} />
              <MetricCard label="Sub Revenue" value={data.monetization.subscription_revenue ?? 0} format="currency" />
              <MetricCard label="ARPU" value={data.monetization.arpu ?? 0} format="currency" />
            </div>
          </section>

          {/* Safety */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Trust & Safety</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Open Reports" value={data.safety.open_reports ?? 0} />
              <MetricCard label="Resolved Reports" value={data.safety.resolved_reports ?? 0} />
              <MetricCard label="Banned Users" value={data.safety.banned_users ?? 0} />
              <MetricCard label="Pending Appeals" value={data.safety.pending_appeals ?? 0} />
            </div>
          </section>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">No analytics data available</div>
      )}
    </div>
  );
}
