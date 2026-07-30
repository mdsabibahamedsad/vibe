"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

interface AuditEntry {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export default function AdminAuditPage() {
  const { user } = useCurrentUser();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [hasMore],
  );

  useEffect(() => {
    fetchAuditLogs();
  }, [actionFilter, targetTypeFilter]);

  async function fetchAuditLogs(cursorVal?: string) {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      if (targetTypeFilter) params.set("targetType", targetTypeFilter);
      if (cursorVal) params.set("cursor", cursorVal);

      const res = await fetch(`/api/admin/audit?${params}`);
      const json = await res.json();
      if (json.success) {
        if (cursorVal) {
          setEntries((prev) => [...prev, ...json.data.items]);
        } else {
          setEntries(json.data.items);
        }
        setHasMore(json.data.hasMore);
        setCursor(json.data.nextCursor);
      } else {
        setError(json.error ?? "Failed to load audit logs");
      }
    } catch {
      setError("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  function loadMore() {
    if (cursor) {
      fetchAuditLogs(cursor);
    }
  }

  if (!user || !canSync(user.role, Permissions.AUDIT_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Immutable record of all admin and moderation actions.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">All Actions</option>
          <option value="admin_login">Login</option>
          <option value="role_changed">Role Change</option>
          <option value="content_removed">Content Removed</option>
          <option value="content_restored">Content Restored</option>
          <option value="user_warned">Warning</option>
          <option value="user_restricted">Restriction</option>
          <option value="user_suspended">Suspension</option>
          <option value="user_banned">Ban</option>
          <option value="user_unbanned">Unban</option>
          <option value="appeal_reviewed">Appeal Reviewed</option>
        </select>

        <select
          value={targetTypeFilter}
          onChange={(e) => setTargetTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">All Targets</option>
          <option value="user">User</option>
          <option value="post">Post</option>
          <option value="comment">Comment</option>
          <option value="story">Story</option>
          <option value="media">Media</option>
          <option value="report">Report</option>
          <option value="appeal">Appeal</option>
        </select>
      </div>

      {loading && entries.length === 0 ? (
        <Loading message="Loading audit log..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={() => fetchAuditLogs()} />
      ) : entries.length === 0 ? (
        <EmptyState title="No audit entries" description="No entries match the current filters." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                        {entry.action.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {entry.targetType}:{entry.targetId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">
                      {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                        <span className="text-xs text-gray-400">
                          {JSON.stringify(entry.metadata).slice(0, 100)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(entry.createdAt).toLocaleString()}
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
