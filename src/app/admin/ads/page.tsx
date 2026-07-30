"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface GlobalMetrics {
  totalImpressions: number;
  totalClicks: number;
  overallCtr: number | null;
  totalSpend: number;
  activeCampaigns: number;
  activeAdvertisers: number;
}

export default function AdminAdsPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const [metrics, setMetrics] = useState<GlobalMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && authenticated) {
      loadMetrics();
    }
  }, [authLoading, authenticated]);

  async function loadMetrics() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/ads/reports");
      const data = await res.json();
      if (data.success) {
        setMetrics(data.data);
      } else {
        setError(data.error ?? "Failed to load metrics");
      }
    } catch {
      setError("Failed to load ad metrics");
    } finally {
      setLoading(false);
    }
  }

  const canManageCampaigns = user ? canSync(user.role, Permissions.ADS_MANAGE_CAMPAIGNS as any) : false;
  const canViewReports = user ? canSync(user.role, Permissions.ADS_VIEW_REPORTS as any) : false;

  if (authLoading || loading) {
    return <div className="flex items-center justify-center h-64"><Loading message="Loading ad dashboard..." /></div>;
  }

  if (error) {
    return <ErrorState title="Failed to load" message={error} onRetry={loadMetrics} />;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ads Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Monitor and manage the ad system
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => router.push("/admin/ads/campaigns")}
          className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 text-left hover:shadow-md transition-shadow"
        >
          <span className="text-2xl">📋</span>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-2">Campaigns</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Manage all campaigns</p>
        </button>
        <button
          onClick={() => router.push("/admin/ads/advertisers")}
          className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 text-left hover:shadow-md transition-shadow"
        >
          <span className="text-2xl">🏢</span>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-2">Advertisers</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Manage advertisers</p>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Impressions</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {metrics ? metrics.totalImpressions.toLocaleString() : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Clicks</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {metrics ? metrics.totalClicks.toLocaleString() : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">CTR</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {metrics?.overallCtr !== null && metrics?.overallCtr !== undefined ? `${metrics.overallCtr}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Spend</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            ⭐{metrics ? metrics.totalSpend.toLocaleString() : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active Campaigns</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {metrics ? metrics.activeCampaigns : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Advertisers</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {metrics ? metrics.activeAdvertisers : "—"}
          </p>
        </div>
      </div>

      {/* Campaigns Pending Review */}
      <div className="rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-5">
        <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">Campaigns Awaiting Review</h3>
        <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
          Check the Campaigns page to review and approve/reject pending campaigns.
        </p>
        <button
          onClick={() => router.push("/admin/ads/campaigns")}
          className="mt-3 inline-block rounded-lg bg-yellow-600 px-4 py-2 text-xs font-medium text-white hover:bg-yellow-700 transition-colors"
        >
          Review Campaigns
        </button>
      </div>
    </div>
  );
}
