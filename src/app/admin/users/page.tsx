"use client";

import { useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

interface UserResult {
  id: string;
  displayName: string;
  telegramUserId: number;
  telegramUsername: string | null;
  role: string;
  isActive: boolean;
  isBanned: boolean;
  accountStatus: string;
  createdAt: string;
}

export default function AdminUsersPage() {
  const { user } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  const searchUsers = useCallback(async (q: string) => {
    if (!q || q.length < 1) return;
    try {
      setLoading(true);
      setError(null);
      setSearched(true);
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success) {
        setResults(json.data.items);
      } else {
        setError(json.error ?? "Search failed");
      }
    } catch {
      setError("Failed to search");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUserDetail = useCallback(async (userId: string) => {
    try {
      setUserDetailLoading(true);
      const res = await fetch(`/api/admin/users?userId=${userId}`);
      const json = await res.json();
      if (json.success) {
        setSelectedUser(json.data);
      }
    } catch {
      // ignore
    } finally {
      setUserDetailLoading(false);
    }
  }, []);

  async function handleAction(action: string, userId: string, extra: Record<string, string> = {}) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId, ...extra }),
      });
      const json = await res.json();
      if (json.success) {
        // Refresh user detail
        loadUserDetail(userId);
        searchUsers(query);
      } else {
        alert(json.error ?? "Action failed");
      }
    } catch {
      alert("Action failed");
    }
  }

  if (!user || !canSync(user.role, Permissions.USERS_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  const canRestrict = canSync(user.role, Permissions.USERS_RESTRICT);
  const canSuspend = canSync(user.role, Permissions.USERS_SUSPEND);
  const canBan = canSync(user.role, Permissions.USERS_BAN);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Search and manage user accounts.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchUsers(query)}
            placeholder="Search by name, username, Telegram ID, or UUID..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => searchUsers(query)}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "..." : "Search"}
          </button>
        </div>
      </div>

      {loading ? (
        <Loading message="Searching..." />
      ) : error ? (
        <ErrorState title="Search Error" message={error} onRetry={() => searchUsers(query)} />
      ) : searched && results.length === 0 ? (
        <EmptyState title="No users found" description="Try a different search term." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Search results */}
          <div className="lg:col-span-1">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase">
              Results ({results.length})
            </h2>
            <div className="space-y-2">
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => loadUserDetail(u.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selectedUser?.user?.id === u.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-gray-900 dark:text-white">
                      {u.displayName}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      u.accountStatus === "banned"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        : u.accountStatus === "suspended"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    }`}>
                      {u.accountStatus}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    @{u.telegramUsername ?? "no username"} · ID: {u.telegramUserId}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* User detail */}
          <div className="lg:col-span-2">
            {userDetailLoading ? (
              <Loading message="Loading user details..." />
            ) : selectedUser ? (
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {selectedUser.user.displayName}
                </h2>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                      {selectedUser.user.accountStatus}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Role</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedUser.user.role}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Telegram ID</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedUser.user.telegramUserId}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Created</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(selectedUser.user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Warnings */}
                {selectedUser.warnings?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Warnings ({selectedUser.warnings.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedUser.warnings.map((w: any) => (
                        <div key={w.id} className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-200">{w.reason}</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            {new Date(w.createdAt).toLocaleDateString()}
                            {!w.isActive && " (Resolved)"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Restrictions */}
                {selectedUser.restrictions?.filter((r: any) => r.isActive).length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Active Restrictions
                    </h3>
                    <div className="space-y-2">
                      {selectedUser.restrictions.filter((r: any) => r.isActive).map((r: any) => (
                        <div key={r.id} className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm">
                          <p className="font-medium text-red-800 dark:text-red-200">
                            {r.type.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {r.reason}
                            {r.expiresAt && ` · Until ${new Date(r.expiresAt).toLocaleDateString()}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Moderation History */}
                {selectedUser.moderationHistory?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Moderation History
                    </h3>
                    <div className="space-y-2">
                      {selectedUser.moderationHistory.map((a: any) => (
                        <div key={a.id} className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3 text-sm">
                          <p className="font-medium text-gray-800 dark:text-gray-200">
                            {a.actionType.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {a.reason ?? ""} · {new Date(a.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Moderation Actions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        const reason = prompt("Warning reason:");
                        if (reason) handleAction("warn", selectedUser.user.id, { reasonCode: "other", reason });
                      }}
                      disabled={!canRestrict}
                      className="rounded-lg bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ⚠️ Warn
                    </button>

                    {selectedUser.user.accountStatus === "suspended" ? (
                      <button
                        onClick={() => handleAction("unsuspend", selectedUser.user.id)}
                        disabled={!canSuspend}
                        className="rounded-lg bg-green-50 dark:bg-green-900/30 px-4 py-2 text-sm font-medium text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-50"
                      >
                        ✅ Unsuspend
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const days = prompt("Suspension duration in days:", "7");
                          const reason = prompt("Suspension reason:");
                          if (days && reason) {
                            const until = new Date(Date.now() + parseInt(days) * 86400000).toISOString();
                            handleAction("suspend", selectedUser.user.id, { reason, suspendedUntil: until });
                          }
                        }}
                        disabled={!canSuspend || selectedUser.user.accountStatus === "banned"}
                        className="rounded-lg bg-orange-50 dark:bg-orange-900/30 px-4 py-2 text-sm font-medium text-orange-700 dark:text-orange-300 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        🔇 Suspend
                      </button>
                    )}

                    {selectedUser.user.accountStatus === "banned" ? (
                      <button
                        onClick={() => handleAction("unban", selectedUser.user.id, { reason: "Appeal approved" })}
                        disabled={!canBan}
                        className="rounded-lg bg-green-50 dark:bg-green-900/30 px-4 py-2 text-sm font-medium text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-50"
                      >
                        ✅ Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const reason = prompt("Ban reason:");
                          if (reason) handleAction("ban", selectedUser.user.id, { reason });
                        }}
                        disabled={!canBan}
                        className="rounded-lg bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        🚫 Ban
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400">
                Select a user to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
