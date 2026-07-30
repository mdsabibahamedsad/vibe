"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface Advertiser {
  id: string;
  owner_user_id: string;
  business_name: string;
  status: string;
  verification_status: string;
  contact_email: string | null;
  created_at: string;
  owner?: { id: string; display_name: string; telegram_user_id: number };
}

export default function AdminAdvertisersPage() {
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && authenticated) {
      loadAdvertisers();
    }
  }, [authLoading, authenticated]);

  async function loadAdvertisers() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/ads/advertisers");
      const data = await res.json();
      if (data.success) {
        setAdvertisers(data.data?.advertisers ?? []);
      } else {
        setError(data.error ?? "Failed to load advertisers");
      }
    } catch {
      setError("Failed to load advertisers");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(advertiserId: string, action: string) {
    try {
      const res = await fetch("/api/admin/ads/advertisers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advertiserId, action }),
      });
      const data = await res.json();
      if (data.success) {
        await loadAdvertisers();
      } else {
        setError(data.error ?? "Action failed");
      }
    } catch {
      setError("Action failed");
    }
  }

  const canManage = user ? canSync(user.role, Permissions.ADS_MANAGE_ADVERTISERS as any) : false;

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    suspended: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    rejected: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center h-64"><Loading message="Loading advertisers..." /></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Advertisers</h1>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {advertisers.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-500">
          No advertisers yet
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Business</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Owner</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Verification</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {advertisers.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{a.business_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {a.owner?.display_name ?? a.owner_user_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[a.status] ?? ""}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`${a.verification_status === "verified" ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}>
                        {a.verification_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {canManage && (
                        <div className="flex gap-1 flex-wrap">
                          {a.status === "pending" && (
                            <button onClick={() => handleAction(a.id, "approve")} className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300">Approve</button>
                          )}
                          {a.status === "active" && (
                            <button onClick={() => handleAction(a.id, "suspend")} className="rounded px-2 py-1 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300">Suspend</button>
                          )}
                          {a.status === "suspended" && (
                            <button onClick={() => handleAction(a.id, "activate")} className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300">Activate</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
