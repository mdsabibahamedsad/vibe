"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  provider: string;
  starts_at: string;
  expires_at: string;
  cancelled_at: string | null;
  created_at: string;
}

interface Transaction {
  id: string;
  user_id: string;
  plan_slug: string;
  plan_stars_price: number;
  stars_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export default function AdminBillingPage() {
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"subscriptions" | "transactions">("subscriptions");

  useEffect(() => {
    if (!authLoading && authenticated && user) {
      loadData();
    }
  }, [authLoading, authenticated, user]);

  const canManagePlans = user ? canSync(user.role, Permissions.BILLING_MANAGE_PLANS as any) : false;

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [subsRes, txsRes] = await Promise.all([
        fetch("/api/admin/billing/subscriptions?limit=20"),
        fetch("/api/admin/billing/transactions?limit=20"),
      ]);

      const subsData = await subsRes.json();
      const txsData = await txsRes.json();

      if (subsData.success) setSubscriptions(subsData.subscriptions ?? []);
      else setError(subsData.error ?? "Failed to load subscriptions");

      if (txsData.success) setTransactions(txsData.transactions ?? []);
      else setError(txsData.error ?? "Failed to load transactions");
    } catch {
      setError("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "expired": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
      case "cancelled": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "past_due": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "paid": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "failed": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "refunded": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
      default: return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center h-64"><Loading message="Loading billing..." /></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage subscriptions, transactions, and plans
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          onClick={() => setTab("subscriptions")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            tab === "subscriptions"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          Subscriptions ({subscriptions.length})
        </button>
        <button
          onClick={() => setTab("transactions")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            tab === "transactions"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          Transactions ({transactions.length})
        </button>
      </div>

      {/* Subscriptions tab */}
      {tab === "subscriptions" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {subscriptions.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No subscriptions found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">User</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Plan</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Expires</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-xs">
                        {sub.user_id.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white capitalize">
                        {sub.plan.replace("premium_", "").replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(sub.status)}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Transactions tab */}
      {tab === "transactions" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No transactions found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">User</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Plan</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-xs">
                        {tx.user_id.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white capitalize">
                        {tx.plan_slug?.replace("premium_", "").replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        ⭐ {tx.stars_amount}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(tx.status)}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
