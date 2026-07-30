"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface RetentionRow {
  week_offset: number;
  cohort_size: number;
  retained_users: number;
  retention_rate: number;
}

export default function AdminRetentionPage() {
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RetentionRow[]>([]);

  const fetchRetention = useCallback(async () => {
    try {
      setLoading(true);
      const end = new Date().toISOString().split("T")[0];
      const start = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const res = await fetch(`/api/admin/analytics/retention?start=${start}&end=${end}`);
      const json = await res.json();
      if (json.success) setData(json.data ?? []);
      else setError(json.error ?? "Failed to load retention data");
    } catch {
      setError("Failed to load retention data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && canSync(user.role, Permissions.ANALYTICS_VIEW)) fetchRetention();
    else setLoading(false);
  }, [user, fetchRetention]);

  if (!user || !canSync(user.role, Permissions.ANALYTICS_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Retention</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Weekly cohort retention table
        </p>
      </div>

      {loading ? (
        <Loading message="Loading retention data..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={fetchRetention} />
      ) : data.length > 0 ? (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Week</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Cohort Size</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Retained</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Retention %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.map((row) => (
                <tr key={row.week_offset} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    Week {row.week_offset}
                    {row.week_offset === 0 && <span className="text-xs text-gray-400 ml-2">(signup)</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{row.cohort_size.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.retained_users.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono font-medium ${
                      row.retention_rate > 50 ? "text-green-600" :
                      row.retention_rate > 20 ? "text-amber-600" : "text-red-600"
                    }`}>
                      {row.retention_rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">No retention data available</div>
      )}
    </div>
  );
}
