"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { CommunityPost } from "../types";

interface UseForumFeedReturn {
  posts: CommunityPost[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  createPost: (caption: string, postType?: string) => Promise<void>;
}

export function useForumFeed(communityId: string): UseForumFeedReturn {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const fetchPosts = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/community/${communityId}/feed?${params.toString()}`);

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load posts" }));
        throw new Error(result.error || "Failed to load posts");
      }

      return await res.json();
    },
    [communityId],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchPosts();
      if (mountedRef.current) {
        setPosts(data.items || []);
        cursorRef.current = data.nextCursor;
        setHasMore(data.hasMore);
      }
    } catch (err) {
      logger.error("Forum feed load error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load forum posts");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetchPosts]);

  useEffect(() => {
    mountedRef.current = true;
    loadInitial();
    return () => { mountedRef.current = false; };
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const data = await fetchPosts(cursorRef.current!);
      if (mountedRef.current) {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = (data.items || []).filter(
            (item: CommunityPost) => !existingIds.has(item.id),
          );
          return [...prev, ...newItems];
        });
        cursorRef.current = data.nextCursor;
        setHasMore(data.hasMore);
      }
    } catch (err) {
      logger.error("Forum feed load more error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      if (mountedRef.current) setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [fetchPosts]);

  const createPost = useCallback(
    async (caption: string, postType: string = "text") => {
      const res = await fetch(`/api/community/${communityId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, postType }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to create post" }));
        throw new Error(data.error || "Failed to create post");
      }

      await loadInitial();
    },
    [communityId, loadInitial],
  );

  return {
    posts,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh: loadInitial,
    loadMore,
    createPost,
  };
}
