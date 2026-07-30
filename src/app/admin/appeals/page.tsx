"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

interface Appeal {
  id: string;
  userId: string;
  reason: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  decisionNote: string | null;
}

export default function AdminAppealsPage() {
  const { user } = useCurrentUser();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailAppeal, setDetailAppeal] = useState<any>(null);

  useEffect(() => {
    fetchAppeals();
  }, [statusFilter]);

  async function fetchAppeals() {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/appeals?${params}`);
      const json = await res.json();
      if (json.success) {
        setAppeals(json.data.items);
      } else {
        setError(json.error ?? "Failed to load appeals");
      }
    } catch {
      setError("Failed to load appeals");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(appealId: string) {
    try {
      const res = await fetch(`/api/admin/appeals?appealId=${appealId}`);
      const json = await res.json();
      if (json.success) {
        setDetailAppeal(json.data);
      }
    } catch {
      // ignore
    }
  }

  async function resolveAppeal(appealId: string, status: "approved" | "denied") {
    const note = status === "denied" ? prompt("Reason for denial:") : undefined;
    try {
      setActionLoading(appealId);
      const res = await fetch("/api/admin/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealId, status, note }),
      });
      const json = await res.json();
      if (json.success) {
        setDetailAppeal(null);
        fetchAppeals();
      } else {
        alert(json.error ?? "Failed to resolve appeal");
      }
    } finally {
      setActionLoading(null);
    }
  }

  if (!user || !canSync(user.role, Permissions.APPEALS_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    denied: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Appeals</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Review user appeals against moderation actions.
        </p>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">All Appeals</option>
          <option value="pending">Pending</option>
          <option value="in_review">In Review</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appeal list */}
        <div className="lg:col-span-1">
          {loading ? (
            <Loading message="Loading appeals..." />
          ) : error ? (
            <ErrorState title="Error" message={error} onRetry={fetchAppeals} />
          ) : appeals.length === 0 ? (
            <EmptyState title="No appeals" description="No appeals match the current filter." />
          ) : (
            <div className="space-y-2">
              {appeals.map((appeal) => (
                <button
                  key={appeal.id}
                  onClick={() => loadDetail(appeal.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    detailAppeal?.appeal?.id === appeal.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[appeal.status] ?? ""}`}>
                      {appeal.status}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(appeal.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white mt-2 line-clamp-2">
                    {appeal.reason}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {detailAppeal ? (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Appeal Details
              </h2>

              {/* Appeal info */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">User Reason</p>
                <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  {detailAppeal.appeal.reason}
                </p>
              </div>

              {/* User info */}
              {detailAppeal.user && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1">User</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {detailAppeal.user.displayName}
                  </p>
                  <p className="text-xs text-gray-500">
                    Status: {detailAppeal.user.accountStatus}
                    {detailAppeal.user.isBanned && " (Banned)"}
                  </p>
                </div>
              )}

              {/* Original moderation action */}
              {detailAppeal.moderationAction && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1">Original Action</p>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {detailAppeal.moderationAction.actionType?.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {detailAppeal.moderationAction.reason ?? ""}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(detailAppeal.moderationAction.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {/* Moderation history */}
              {detailAppeal.userModerationHistory?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1">User Moderation History</p>
                  <div className="space-y-1">
                    {detailAppeal.userModerationHistory.map((a: any) => (
                      <div key={a.id} className="text-sm text-gray-600 dark:text-gray-400">
                        {a.actionType.replace(/_/g, " ")} — {new Date(a.createdAt).toLocaleDateString()}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {(detailAppeal.appeal.status === "pending" || detailAppeal.appeal.status === "in_review") &&
                canSync(user.role, Permissions.APPEALS_RESOLVE) && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex gap-3">
                  <button
                    onClick={() => resolveAppeal(detailAppeal.appeal.id, "approved")}
                    disabled={actionLoading === detailAppeal.appeal.id}
                    className="rounded-lg bg-green-50 dark:bg-green-900/30 px-4 py-2 text-sm font-medium text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-50"
                  >
                    ✅ Approve Appeal
                  </button>
                  <button
                    onClick={() => resolveAppeal(detailAppeal.appeal.id, "denied")}
                    disabled={actionLoading === detailAppeal.appeal.id}
                    className="rounded-lg bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-100 disabled:opacity-50"
                  >
                    ❌ Deny Appeal
                  </button>
                </div>
              )}

              {/* Decision info */}
              {(detailAppeal.appeal.status === "approved" || detailAppeal.appeal.status === "denied") && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm text-gray-500">
                    Decision: <span className={detailAppeal.appeal.status === "approved" ? "text-green-600" : "text-red-600"}>
                      {detailAppeal.appeal.status}
                    </span>
                  </p>
                  {detailAppeal.appeal.decisionNote && (
                    <p className="text-sm text-gray-500 mt-1">
                      Note: {detailAppeal.appeal.decisionNote}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              Select an appeal to review
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
