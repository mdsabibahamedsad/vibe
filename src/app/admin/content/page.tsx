"use client";

import { useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState, EmptyState } from "@/components/ui";

type ContentType = "post" | "comment" | "story" | "media";

interface ContentItem {
  id: string;
  type: ContentType;
  authorId: string;
  preview: string | null;
  moderationStatus: string;
  createdAt: string;
  removedAt: string | null;
  removalReason: string | null;
}

export default function AdminContentPage() {
  const { user } = useCurrentUser();
  const [contentType, setContentType] = useState<ContentType | "">("");
  const [modStatus, setModStatus] = useState<string>("");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function searchContent() {
    try {
      setLoading(true);
      setError(null);
      setSearched(true);
      const params = new URLSearchParams();
      if (contentType) params.set("type", contentType);
      if (modStatus) params.set("moderationStatus", modStatus);

      const res = await fetch(`/api/admin/content?${params}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items ?? []);
      } else {
        setError(json.error ?? "Failed to load content");
      }
    } catch {
      setError("Failed to load content");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(contentType: ContentType, contentId: string, action: "remove" | "restore") {
    const reason = action === "remove" ? prompt("Removal reason code (e.g., spam, harassment):") : "";
    if (action === "remove" && !reason) return;

    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          contentType,
          contentId,
          reasonCode: reason || "moderator_discretion",
          reason: reason || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        searchContent();
      } else {
        alert(json.error ?? "Action failed");
      }
    } catch {
      alert("Action failed");
    }
  }

  if (!user || !canSync(user.role, Permissions.CONTENT_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  const statusColors: Record<string, string> = {
    visible: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    under_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    removed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    restored: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Content Moderation</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Review and moderate user-generated content.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={contentType}
          onChange={(e) => setContentType(e.target.value as ContentType | "")}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">All Types</option>
          <option value="post">Posts</option>
          <option value="comment">Comments</option>
          <option value="story">Stories</option>
          <option value="media">Media</option>
        </select>

        <select
          value={modStatus}
          onChange={(e) => setModStatus(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">All Status</option>
          <option value="visible">Visible</option>
          <option value="under_review">Under Review</option>
          <option value="removed">Removed</option>
          <option value="restored">Restored</option>
        </select>

        <button
          onClick={searchContent}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Search"}
        </button>
      </div>

      {loading ? (
        <Loading message="Loading content..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={searchContent} />
      ) : searched && items.length === 0 ? (
        <EmptyState title="No content found" description="Try different filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preview</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {items.map((item) => (
                <tr key={`${item.type}-${item.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      statusColors[item.moderationStatus] ?? "bg-gray-100 text-gray-700"
                    }`}>
                      {item.moderationStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">
                    <span className="text-sm text-gray-500">
                      {item.preview ?? "(no preview)"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {item.moderationStatus === "visible" || item.moderationStatus === "restored" ? (
                      <button
                        onClick={() => handleAction(item.type, item.id, "remove")}
                        className="rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    ) : item.moderationStatus === "removed" ? (
                      <button
                        onClick={() => handleAction(item.type, item.id, "restore")}
                        className="rounded-lg bg-green-50 dark:bg-green-900/30 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 hover:bg-green-100"
                      >
                        Restore
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
