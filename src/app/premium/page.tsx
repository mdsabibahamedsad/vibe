"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Loading, ErrorState, Button } from "@/components/ui";

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  starsPrice: number;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
  features: string[];
  monthlyPrice: number;
}

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscription: {
    id: string;
    planSlug: string;
    status: string;
    expiresAt: string | null;
    cancelledAt: string | null;
  } | null;
  entitlements: string[];
  expiresAt: string | null;
  isCancelled: boolean;
}

export default function PremiumPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!authLoading && authenticated) {
      loadData();
    }
  }, [authLoading, authenticated]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [plansRes, subRes] = await Promise.all([
        fetch("/api/billing/plans"),
        fetch("/api/billing/subscription"),
      ]);

      const plansData = await plansRes.json();
      const subData = await subRes.json();

      if (plansData.success) setPlans(plansData.plans ?? []);
      if (subData.success) {
        setSubscription({
          hasActiveSubscription: subData.hasActiveSubscription,
          subscription: subData.subscription,
          entitlements: subData.entitlements ?? [],
          expiresAt: subData.expiresAt,
          isCancelled: subData.isCancelled,
        });
      }
    } catch {
      setError("Failed to load premium information");
    } finally {
      setLoading(false);
    }
  }

  const handlePurchase = useCallback(async (planSlug: string) => {
    try {
      setPurchasing(planSlug);
      setError(null);

      // Step 1: Get invoice link from server
      const res = await fetch("/api/billing/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "Failed to create invoice");
        return;
      }

      // Step 2: Open Telegram invoice via Mini App
      if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
        const tg = (window as any).Telegram.WebApp;

        tg.openInvoice(data.invoice.link, async (status: string) => {
          if (status === "paid") {
            // Step 3: Payment successful — refresh subscription state
            setSuccessMessage("Payment successful! Activating premium...");
            await new Promise((r) => setTimeout(r, 2000)); // Wait for webhook to process
            await loadData();
            setSuccessMessage("Premium activated! 🎉");
            setTimeout(() => setSuccessMessage(null), 5000);
          } else if (status === "failed" || status === "cancelled") {
            setError("Payment was cancelled or failed. Please try again.");
          } else {
            // "pending" — still processing
            setSuccessMessage("Payment processing...");
          }
        });
      } else {
        // Fallback for non-Telegram environments (dev)
        window.open(data.invoice.link, "_blank");
        setSuccessMessage("Invoice opened in new tab");
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch {
      setError("Failed to process purchase. Please try again.");
    } finally {
      setPurchasing(null);
    }
  }, []);

  async function handleCancel() {
    if (!confirm("Cancel your premium subscription? You'll keep premium access until the end of the current billing period.")) {
      return;
    }

    try {
      setCancelling(true);
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage(data.message ?? "Subscription cancelled.");
        await loadData();
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(data.error ?? "Failed to cancel");
      }
    } catch {
      setError("Failed to cancel subscription");
    } finally {
      setCancelling(false);
    }
  }

  async function handleRestore() {
    try {
      setLoading(true);
      const res = await fetch("/api/billing/restore", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        if (data.hasActiveSubscription) {
          setSuccessMessage(data.message ?? "Premium restored! 🎉");
        } else {
          setError(data.message ?? "No active Premium subscription found");
        }
        setSubscription({
          hasActiveSubscription: data.hasActiveSubscription,
          subscription: data.subscription,
          entitlements: data.entitlements ?? [],
          expiresAt: data.expiresAt,
          isCancelled: data.isCancelled,
        });
        setTimeout(() => {
          setSuccessMessage(null);
          setError(null);
        }, 5000);
      }
    } catch {
      setError("Failed to restore premium");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loading message="Loading Premium..." />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-gray-500">Please sign in to view premium.</p>
      </div>
    );
  }

  const featureLabels: Record<string, string> = {
    premium_badge: "Premium Badge",
    advanced_discovery: "Advanced Discovery Filters",
    unlimited_likes: "Unlimited Likes",
    advanced_filters: "Advanced Search Filters",
    who_liked_you: "See Who Liked You",
    read_receipts: "Read Receipts",
    incognito_mode: "Incognito Mode",
    profile_boost: "Profile Boost",
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[var(--tg-theme-bg-color,#ffffff)] to-gray-50 dark:to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-sm text-[var(--tg-theme-button-color,#0088cc)]">
            ← Back
          </button>
          <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">Premium</h1>
          <div className="w-12" />
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Status messages */}
        {successMessage && (
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4 text-sm font-medium text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 text-sm font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {/* Current Subscription Status */}
        {subscription?.hasActiveSubscription && subscription.subscription && (
          <div className="rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 p-5 text-white shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">👑</span>
              <h2 className="text-lg font-bold">Premium Active</h2>
            </div>
            <div className="space-y-1 text-sm text-white/90">
              <p>Plan: <span className="font-medium capitalize">{subscription.subscription.planSlug.replace("premium_", "")}</span></p>
              {subscription.expiresAt && (
                <p>
                  {subscription.isCancelled ? "Access until" : "Renews on"}:{" "}
                  <span className="font-medium">
                    {new Date(subscription.expiresAt).toLocaleDateString("en-US", {
                      year: "numeric", month: "long", day: "numeric",
                    })}
                  </span>
                </p>
              )}
              {subscription.isCancelled && (
                <p className="mt-2 text-yellow-200">Auto-renewal: Off</p>
              )}
            </div>
          </div>
        )}

        {/* Cancel/Restore buttons */}
        {subscription?.hasActiveSubscription && (
          <div className="flex gap-3">
            {!subscription.isCancelled && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 rounded-xl border border-red-200 dark:border-red-800 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                {cancelling ? "..." : "Cancel Subscription"}
              </button>
            )}
            <button
              onClick={handleRestore}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Restore
            </button>
          </div>
        )}

        {/* Page heading */}
        {!subscription?.hasActiveSubscription && (
          <div className="text-center py-4">
            <h2 className="text-2xl font-bold text-[var(--tg-theme-text-color,#000000)]">
              Unlock Premium
            </h2>
            <p className="mt-2 text-sm text-[var(--tg-theme-hint-color,#999999)]">
              Get the most out of Vibe with exclusive features
            </p>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-[var(--tg-theme-text-color,#000000)]">
                    {plan.name}
                  </h3>
                  {plan.description && (
                    <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] mt-0.5">
                      {plan.description}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[var(--tg-theme-text-color,#000000)]">
                    ⭐ {plan.starsPrice}
                  </p>
                  <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
                    ~⭐{plan.monthlyPrice}/mo
                  </p>
                </div>
              </div>

              {/* Feature list */}
              <div className="space-y-2 mb-4">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">✓</span>
                    <span className="text-[var(--tg-theme-text-color,#000000)]">
                      {featureLabels[feature] ?? feature.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <button
                onClick={() => handlePurchase(plan.slug)}
                disabled={purchasing === plan.slug}
                className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 py-3 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {purchasing === plan.slug
                  ? "Processing..."
                  : subscription?.hasActiveSubscription
                    ? "Upgrade"
                    : "Get Premium"}
              </button>
            </div>
          ))}
        </div>

        {/* Trust section */}
        <div className="text-center py-4">
          <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
            Secure payment via Telegram Stars ⭐
          </p>
          <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] mt-1">
            Cancel anytime. Premium remains active until end of billing period.
          </p>
        </div>
      </div>
    </div>
  );
}
