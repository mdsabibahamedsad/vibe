"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Loading, EmptyState, ErrorState } from "@/components/ui";

interface Transaction {
  id: string;
  plan_slug: string;
  plan_stars_price: number;
  stars_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export default function BillingHistoryPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && authenticated) {
      loadTransactions();
    }
  }, [authLoading, authenticated]);

  async function loadTransactions() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/billing/transactions");
      const data = await res.json();

      if (data.success) {
        setTransactions(data.transactions ?? []);
      } else {
        setError(data.error ?? "Failed to load history");
      }
    } catch {
      setError("Failed to load billing history");
    } finally {
      setLoading(false);
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "paid": return "text-green-600 dark:text-green-400";
      case "pending": return "text-yellow-600 dark:text-yellow-400";
      case "failed": return "text-red-600 dark:text-red-400";
      case "refunded": return "text-orange-600 dark:text-orange-400";
      case "cancelled": return "text-gray-500";
      default: return "text-gray-500";
    }
  };

  const formatPlanName = (slug: string) =>
    slug.replace("premium_", "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (authLoading || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loading message="Loading billing history..." />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-gray-500">Please sign in to view billing history.</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--tg-theme-bg-color,#ffffff)]">
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/premium")}
            className="text-sm font-medium text-[var(--tg-theme-button-color,#0088cc)]"
          >
            ← Premium
          </button>
          <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
            Billing History
          </h1>
          <div className="w-12" />
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto">
        {error ? (
          <ErrorState title="Failed to load history" message={error} onRetry={loadTransactions} />
        ) : transactions.length === 0 ? (
          <div className="pt-12">
            <EmptyState
              title="No transactions yet"
              description="Your payment history will appear here after your first purchase."
              action={
                <button
                  onClick={() => router.push("/premium")}
                  className="mt-3 inline-block rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-6 py-2.5 text-sm font-medium text-white"
                >
                  Get Premium
                </button>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--tg-theme-text-color,#000000)]">
                      {formatPlanName(tx.plan_slug)}
                    </p>
                    <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
                      {new Date(tx.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-[var(--tg-theme-text-color,#000000)]">
                      ⭐ {tx.stars_amount}
                    </p>
                    <p className={`text-xs font-medium capitalize ${statusColor(tx.status)}`}>
                      {tx.status}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[var(--tg-theme-hint-color,#999999)]">
          All transactions are processed securely through Telegram Stars ⭐
        </p>
      </div>
    </div>
  );
}
