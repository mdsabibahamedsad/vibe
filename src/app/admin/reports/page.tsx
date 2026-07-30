"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed" | "escalated";
type ReportPriority = "low" | "normal" | "high" | "critical";

interface Report {
  id: string;
  reason: string;
  status: ReportStatus;
  priority: ReportPriority;
  createdAt: string;
  reporterId: string;
  reportedUserId: string | null;
  reportedPostId: string | null;
  assignedTo: string | null;
  duplicateGroupId: string | null;
}

export default function AdminReportsPage() {
  const { user } = useCurrentUser();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<ReportPriority | "">("");
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (actionLoading) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [actionLoading, hasMore],
  );

  useEffect(() => {
    fetchReports();
  }, [statusFilter, priorityFilter]);

  async function fetchReports(cursorVal?: string) {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (cursorVal) params.set("cursor", cursorVal);
      params.set("limit", "25");

      const res = await fetch(`/api/admin/reports?${params}`);
      const json = await res.json();
      if (json.success) {
        if (cursorVal) {
          setReports((prev) => [...prev, ...json.data.items]);
        } else {
          setReports(json.data.items);
        }
        setHasMore(json.data.hasMore);
        setCursor(json.data.nextCursor);
      } else {
        setError(json.error ?? "Failed to load reports");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }

  function loadMore() {
    if (cursor && !actionLoading) {
      fetchReports(cursor);
    }
  }

  async function handleAction(reportId: string, action: "resolve" | "dismiss" | "escalate") {
    try {
      setActionLoading(reportId);
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action === "escalate" ? "escalate" : "resolve",
          reportId,
          status: action === "dismiss" ? "dismissed" : "resolved",
          escalateToUserId: "", // Would need a picker in a real implementation
          reason: "Quick action",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      }
    } finally {
      setActionLoading(null);
    }
  }

  const priorityColors: Record<ReportPriority, string> = {
    critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    normal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    low: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  };

  const statusColors: Record<ReportStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    reviewing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    dismissed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
    escalated: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  };

  if (!user || !canSync(user.role, Permissions.REPORTS_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports Queue</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Review and manage user reports.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ReportStatus | "")}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="reviewing">In Review</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="escalated">Escalated</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as ReportPriority | "")}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">All Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      {loading && reports.length === 0 ? (
        <Loading message="Loading reports..." />
      ) : error ? (
        <ErrorState title="Failed to load" message={error} onRetry={() => fetchReports()} />
      ) : reports.length === 0 ? (
        <EmptyState
          title="No reports found"
          description={statusFilter ? "No reports match the current filter." : "No pending reports. Everything looks good!"}
          icon={<span className="text-3xl">✅</span>}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColors[report.priority]}`}>
                        {report.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[report.status]}`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {report.reason.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {report.reportedUserId
                        ? "User"
                        : report.reportedPostId
                          ? "Post"
                          : "Unknown"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        {report.status === "pending" || report.status === "reviewing" ? (
                          <>
                            <button
                              onClick={() => handleAction(report.id, "resolve")}
                              disabled={actionLoading === report.id}
                              className="rounded-lg bg-green-50 dark:bg-green-900/30 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-50"
                            >
                              Resolve
                            </button>
                            <button
                              onClick={() => handleAction(report.id, "dismiss")}
                              disabled={actionLoading === report.id}
                              className="rounded-lg bg-gray-50 dark:bg-gray-700/30 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Completed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-6">
              <button
                onClick={loadMore}
                disabled={actionLoading === "load-more"}
                className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
