"use client";

import { useCallback, useState } from "react";
import { logger } from "@/lib/logger";

interface UsePostReturn {
  liking: boolean;
  commenting: boolean;
  error: string | null;
  likePost: (postId: string) => Promise<boolean>;
  unlikePost: (postId: string) => Promise<boolean>;
  createComment: (postId: string, content: string, parentCommentId?: string) => Promise<any>;
  deletePost: (postId: string) => Promise<boolean>;
  followUser: (userId: string) => Promise<boolean>;
  unfollowUser: (userId: string) => Promise<boolean>;
  reportContent: (data: {
    reason: string;
    details?: string;
    reportedUserId?: string;
    reportedPostId?: string;
  }) => Promise<boolean>;
}

export function usePost(): UsePostReturn {
  const [liking, setLiking] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const likePost = useCallback(async (postId: string): Promise<boolean> => {
    setLiking(true);
    setError(null);
    try {
      const res = await fetch("/api/posts/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to like");
      }
      return true;
    } catch (err) {
      logger.error("Like error", { error: err instanceof Error ? err.message : "Unknown" });
      setError(err instanceof Error ? err.message : "Failed to like");
      return false;
    } finally {
      setLiking(false);
    }
  }, []);

  const unlikePost = useCallback(async (postId: string): Promise<boolean> => {
    setLiking(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/like?postId=${postId}`, { method: "DELETE" });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to unlike");
      }
      return true;
    } catch (err) {
      logger.error("Unlike error", { error: err instanceof Error ? err.message : "Unknown" });
      setError(err instanceof Error ? err.message : "Failed to unlike");
      return false;
    } finally {
      setLiking(false);
    }
  }, []);

  const createComment = useCallback(
    async (postId: string, content: string, parentCommentId?: string) => {
      setCommenting(true);
      setError(null);
      try {
        const res = await fetch("/api/posts/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, content, parentCommentId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to comment");
        return data.comment;
      } catch (err) {
        logger.error("Comment error", {
          error: err instanceof Error ? err.message : "Unknown",
        });
        setError(err instanceof Error ? err.message : "Failed to comment");
        return null;
      } finally {
        setCommenting(false);
      }
    },
    [],
  );

  const deletePost = useCallback(async (postId: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`/api/posts?id=${postId}`, { method: "DELETE" });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to delete");
      }
      return true;
    } catch (err) {
      logger.error("Delete error", { error: err instanceof Error ? err.message : "Unknown" });
      setError(err instanceof Error ? err.message : "Failed to delete");
      return false;
    }
  }, []);

  const followUser = useCallback(async (userId: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to follow");
      }
      return true;
    } catch (err) {
      logger.error("Follow error", { error: err instanceof Error ? err.message : "Unknown" });
      setError(err instanceof Error ? err.message : "Failed to follow");
      return false;
    }
  }, []);

  const unfollowUser = useCallback(async (userId: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`/api/follows?userId=${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to unfollow");
      }
      return true;
    } catch (err) {
      logger.error("Unfollow error", { error: err instanceof Error ? err.message : "Unknown" });
      setError(err instanceof Error ? err.message : "Failed to unfollow");
      return false;
    }
  }, []);

  const reportContent = useCallback(
    async (data: {
      reason: string;
      details?: string;
      reportedUserId?: string;
      reportedPostId?: string;
    }): Promise<boolean> => {
      setError(null);
      try {
        const res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const result = await res.json();
          throw new Error(result.error || "Failed to report");
        }
        return true;
      } catch (err) {
        logger.error("Report error", {
          error: err instanceof Error ? err.message : "Unknown",
        });
        setError(err instanceof Error ? err.message : "Failed to submit report");
        return false;
      }
    },
    [],
  );

  return {
    liking,
    commenting,
    error,
    likePost,
    unlikePost,
    createComment,
    deletePost,
    followUser,
    unfollowUser,
    reportContent,
  };
}
