"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Loading, ErrorState, EmptyState, Card } from "@/components/ui";

interface UserAppeal {
  id: string;
  moderationActionId: string | null;
  reason: string;
  status: string;
  decisionNote: string | null;
  createdAt: string;
}

export default function UserAppealsPage() {
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const [appeals, setAppeals] = useState<UserAppeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [moderationActionId, setModerationActionId] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && authenticated && user) {
      fetchAppeals();
    }
  }, [authLoading, authenticated, user]);

  async function fetchAppeals() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/appeals");
      const json = await res.json();
      if (json.success) {
        setAppeals(json.data.items ?? []);
      } else {
        setError(json.error ?? "Failed to load appeals");
      }
    } catch {
      setError("Failed to load appeals");
    } finally {
      setLoading(false);
    }
  }

  async function submitAppeal() {
    if (!moderationActionId) {
      alert("Please enter the ID of the moderation action you are appealing.");
      return;
    }
    if (!appealReason.trim() || appealReason.trim().length < 10) {
      alert("Please write a detailed reason for your appeal (at least 10 characters).");
      return;
    }

    try {
      setSubmitting(true);
      setSuccessMessage(null);

      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moderationActionId: moderationActionId.trim(),
          reason: appealReason.trim(),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccessMessage("Your appeal has been submitted. A moderator will review it.");
        setAppealReason("");
        setModerationActionId("");
        fetchAppeals();
      } else {
        alert(json.error ?? "Failed to submit appeal");
      }
    } catch {
      alert("Failed to submit appeal. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-gray-500">Please sign in to view appeals.</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    denied: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div className="min-h-dvh bg-[var(--tg-theme-bg-color,#ffffff)]">
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md px-4 py-3">
        <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">Appeals</h1>
      </header>

      <div className="p-4 max-w-2xl mx-auto space-y-6">
        {successMessage && (
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4 text-sm text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
            {successMessage}
          </div>
        )}

        {/* Submit an Appeal */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)] mb-4">
            Submit an Appeal
          </h2>
          <p className="text-sm text-[var(--tg-theme-hint-color,#999999)] mb-4">
            If you believe a moderation decision was made in error, you can submit an appeal.
            You will need the ID of the moderation action you are appealing against.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-1">
                Moderation Action ID
              </label>
              <input
                type="text"
                value={moderationActionId}
                onChange={(e) => setModerationActionId(e.target.value)}
                placeholder="Paste the moderation action ID here..."
                className="w-full rounded-xl border border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)] p-3 text-sm text-[var(--tg-theme-text-color,#000000)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-1">
                Why do you think this decision was incorrect?
              </label>
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Explain why you believe this action should be reviewed..."
                rows={4}
                maxLength={2000}
                className="w-full rounded-xl border border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)] p-3 text-sm text-[var(--tg-theme-text-color,#000000)] placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
              />
              <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] mt-1">
                {appealReason.length}/2000 characters (minimum 10)
              </p>
            </div>

            <button
              onClick={submitAppeal}
              disabled={submitting || appealReason.trim().length < 10 || !moderationActionId.trim()}
              className="w-full rounded-xl bg-[var(--tg-theme-button-color,#0088cc)] py-3 text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            >
              {submitting ? "Submitting..." : "Submit Appeal"}
            </button>
          </div>
        </Card>

        {/* Previous Appeals */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)] mb-4">
            Your Appeals
          </h2>

          {loading ? (
            <Loading message="Loading appeals..." />
          ) : error ? (
            <ErrorState title="Error" message={error} onRetry={fetchAppeals} />
          ) : appeals.length === 0 ? (
            <EmptyState
              title="No appeals yet"
              description="When you submit an appeal, it will appear here."
            />
          ) : (
            <div className="space-y-3">
              {appeals.map((appeal) => (
                <div
                  key={appeal.id}
                  className="rounded-xl border border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        statusColors[appeal.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {appeal.status.replace("_", " ")}
                    </span>
                    <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
                      {new Date(appeal.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--tg-theme-text-color,#000000)]">
                    {appeal.reason}
                  </p>
                  {appeal.decisionNote && (
                    <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] mt-2">
                      Decision: {appeal.decisionNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
