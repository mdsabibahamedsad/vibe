"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface Campaign {
  id: string;
  advertiser_id: string;
  name: string;
  objective: string;
  status: string;
  pricing_model: string;
  budget_amount: number;
  spent_amount: number;
  currency: string;
  start_at: string;
  end_at: string;
  priority: number;
  is_house_campaign: boolean;
  created_at: string;
  advertiser?: { id: string; business_name: string };
}

export default function AdminAdCampaignsPage() {
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    if (!authLoading && authenticated) {
      loadCampaigns();
    }
  }, [authLoading, authenticated, statusFilter]);

  async function loadCampaigns() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/ads/campaigns?${params}`);
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.data?.campaigns ?? []);
      } else {
        setError(data.error ?? "Failed to load campaigns");
      }
    } catch {
      setError("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(campaignId: string, action: string, reason?: string) {
    try {
      const res = await fetch("/api/admin/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, action, reason }),
      });
      const data = await res.json();
      if (data.success) {
        await loadCampaigns();
      } else {
        setError(data.error ?? "Action failed");
      }
    } catch {
      setError("Action failed");
    }
  }

  const canManage = user ? canSync(user.role, Permissions.ADS_MANAGE_CAMPAIGNS as any) : false;

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    pending_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    paused: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center h-64"><Loading message="Loading campaigns..." /></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Campaigns</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="pending_review">Pending Review</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-500">
          No campaigns found
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Advertiser</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Budget</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Spent</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Schedule</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{c.objective.replace(/_/g, " ")}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-xs">
                      {c.advertiser?.business_name ?? c.advertiser_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[c.status] ?? ""}`}>
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-xs">
                      {c.currency} {c.budget_amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-xs">
                      {c.spent_amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(c.start_at).toLocaleDateString()} — {new Date(c.end_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {canManage && (
                        <div className="flex gap-1 flex-wrap">
                          {c.status === "pending_review" && (
                            <>
                              <button onClick={() => handleAction(c.id, "approve")} className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300">Approve</button>
                              <button onClick={() => { const r = prompt("Rejection reason:"); if (r) handleAction(c.id, "reject", r); }} className="rounded px-2 py-1 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300">Reject</button>
                            </>
                          )}
                          {c.status === "active" && (
                            <button onClick={() => handleAction(c.id, "pause")} className="rounded px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300">Pause</button>
                          )}
                          {c.status === "paused" && (
                            <button onClick={() => handleAction(c.id, "resume")} className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300">Resume</button>
                          )}
                          {c.status === "approved" && (
                            <button onClick={() => handleAction(c.id, "activate")} className="rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300">Activate</button>
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
