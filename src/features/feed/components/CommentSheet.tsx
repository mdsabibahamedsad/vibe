"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Avatar } from "@/components/ui";
import { logger } from "@/lib/logger";

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    isVerified: boolean;
  } | null;
  content: string;
  parentCommentId: string | null;
  replies: Comment[];
  createdAt: string;
  isDeleted: boolean;
}

interface CommentSheetProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  onCommentCreated: (increment: number) => void;
}

export function CommentSheet({ open, onClose, postId, onCommentCreated }: CommentSheetProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadComments = useCallback(
    async (cursorVal?: string) => {
      const params = new URLSearchParams();
      params.set("postId", postId);
      params.set("limit", "20");
      if (cursorVal) params.set("cursor", cursorVal);

      try {
        const res = await fetch(`/api/posts/comments?${params}`);
        const data = await res.json();

        if (cursorVal) {
          setComments((prev) => [...prev, ...(data.items || [])]);
        } else {
          setComments(data.items || []);
        }
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch (err) {
        logger.error("Failed to load comments", { error: err });
      } finally {
        setLoading(false);
      }
    },
    [postId],
  );

  useEffect(() => {
    if (open) {
      setLoading(true);
      loadComments();
      setReplyTo(null);
    }
  }, [open, loadComments]);

  const handleSubmit = async () => {
    if (!newComment.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/posts/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          content: newComment.trim(),
          parentCommentId: replyTo?.id || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.comment) {
        if (replyTo) {
          // Add reply to parent
          setComments((prev) =>
            prev.map((c) =>
              c.id === replyTo.id ? { ...c, replies: [...c.replies, data.comment] } : c,
            ),
          );
        } else {
          setComments((prev) => [data.comment, ...prev]);
        }
        setNewComment("");
        setReplyTo(null);
        onCommentCreated(1);

        // Scroll to top to see new comment
        listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      logger.error("Failed to send comment", { error: err });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await fetch(`/api/posts/comments?id=${commentId}`, { method: "DELETE" });
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentCreated(-1);
    } catch (err) {
      logger.error("Failed to delete comment", { error: err });
    }
  };

  const formatTime = (dateStr: string) => {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return new Date(dateStr).toLocaleDateString();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div className="relative mt-auto flex h-[80vh] flex-col rounded-t-2xl bg-[var(--tg-theme-bg-color,#ffffff)] shadow-xl animate-slide-up">
        {/* Handle */}
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-gray-300" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
          <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
            Comments
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--tg-theme-hint-color,#999999)] hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Comments list */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <svg
                className="h-6 w-6 animate-spin text-[var(--tg-theme-button-color,#0088cc)]"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-sm text-[var(--tg-theme-hint-color,#999999)] py-8">
              No comments yet. Be the first!
            </p>
          ) : (
            comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onReply={(id, name) => {
                  setReplyTo({ id, name });
                  inputRef.current?.focus();
                }}
                onDelete={handleDelete}
                formatTime={formatTime}
              />
            ))
          )}

          {hasMore && (
            <button
              onClick={() => loadComments(cursor!)}
              className="w-full py-2 text-sm text-[var(--tg-theme-button-color,#0088cc)] font-medium"
            >
              Load more
            </button>
          )}
        </div>

        {/* Reply indicator */}
        {replyTo && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] mx-3 rounded-t-lg">
            <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
              Replying to <strong>{replyTo.name}</strong>
            </span>
            <button
              onClick={() => setReplyTo(null)}
              className="ml-auto text-[var(--tg-theme-hint-color,#999999)]"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-3 py-3 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Write a comment..."
            className="flex-1 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-2.5 text-sm text-[var(--tg-theme-text-color,#000000)] placeholder:text-[var(--tg-theme-hint-color,#999999)] focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
            maxLength={1000}
          />
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim() || sending}
            className="rounded-xl bg-[var(--tg-theme-button-color,#0088cc)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-opacity"
          >
            {sending ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Comment Item ─────────────────────────────────────────────────────────

function CommentItem({
  comment,
  onReply,
  onDelete,
  formatTime,
}: {
  comment: Comment;
  onReply: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  formatTime: (date: string) => string;
}) {
  if (comment.isDeleted) {
    return (
      <div className="text-sm italic text-[var(--tg-theme-hint-color,#999999)]">[deleted]</div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-2.5">
        <Avatar
          src={comment.author?.avatarUrl}
          alt={comment.author?.displayName ?? "User"}
          size="sm"
          fallback={comment.author?.displayName?.charAt(0) ?? "?"}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)]">
              {comment.author?.displayName ?? "Unknown"}
            </span>
            <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
              {formatTime(comment.createdAt)}
            </span>
          </div>
          <p className="text-sm text-[var(--tg-theme-text-color,#000000)] mt-0.5">
            {comment.content}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={() => onReply(comment.id, comment.author?.displayName ?? "User")}
              className="text-xs text-[var(--tg-theme-hint-color,#999999)] hover:text-[var(--tg-theme-button-color,#0088cc)]"
            >
              Reply
            </button>
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className="ml-10 mt-2 space-y-2 pl-3 border-l-2 border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-2">
              <Avatar
                src={reply.author?.avatarUrl}
                alt={reply.author?.displayName ?? "User"}
                size="sm"
                fallback={reply.author?.displayName?.charAt(0) ?? "?"}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)]">
                    {reply.author?.displayName ?? "Unknown"}
                  </span>
                  <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
                    {formatTime(reply.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-[var(--tg-theme-text-color,#000000)] mt-0.5">
                  {reply.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
