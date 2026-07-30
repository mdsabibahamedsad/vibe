"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface QualityCheck {
  check_name: string;
  status: string;
  detail: string;
  severity: string;
}

export default function AdminDataQualityPage() {
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<QualityCheck[]>([]);

  const runChecks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/analytics/data-quality");
      const json = await res.json();
      if (json.success) setChecks(json.data ?? []);
      else setError(json.error ?? "Failed to run data quality checks");
    } catch {
      setError("Failed to run data quality checks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && canSync(user.role, Permissions.ANALYTICS_VIEW)) runChecks();
    else setLoading(false);
  }, [user, runChecks]);

  if (!user || !canSync(user.role, Permissions.ANALYTICS_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  const severityColors: Record<string, string> = {
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };

  const statusIcons: Record<string, string> = {
    pass: "✅",
    warn: "⚠️",
    fail: "❌",
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Data Quality</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Automated data quality checks for analytics
          </p>
        </div>
        <button
          onClick={runChecks}
          disabled={loading}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Checks"}
        </button>
      </div>

      {loading ? (
        <Loading message="Running data quality checks..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={runChecks} />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Check</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Detail</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {checks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    No data quality checks available
                  </td>
                </tr>
              )}
              {checks.map((check, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-lg">{statusIcons[check.status] ?? "❓"}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{check.check_name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{check.detail}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${severityColors[check.severity] ?? ""}`}>
                      {check.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
