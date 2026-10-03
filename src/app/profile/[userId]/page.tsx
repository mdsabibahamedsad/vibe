"use client";

/**
 * UserProfile — public profile view for any user.
 *
 * Fixes the previously missing /profile/[userId] route that notifications,
 * search results, and discovery cards link to.
 *
 * Real backend data only:
 *   - /api/posts?authorId=…   (posts + author summary)
 *   - /api/follows?userId=…   (follow status + counts)
 *   - POST/DELETE /api/follows (follow toggle)
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { BottomNav, DesktopNav } from "@/components/bottom-nav";
import { Avatar, EmptyState, ErrorState, ProfileSkeleton } from "@/components/ui";
import { FollowButton } from "@/features/feed/components/FollowButton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface AuthorSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  age: number | null;
  city: string | null;
  isVerified: boolean;
  isFollowing: boolean;
}

interface AuthorPost {
  id: string;
  caption: string | null;
  postType: string;
  likeCount: number;
  commentCount: number;
  media: { id: string; mediaId: string; mediaType: string }[];
  createdAt: string;
}

interface FollowState {
  isFollowing: boolean;
  followersCount: number;
  followingCount: number;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  const mins = Math.floor(seconds / 60);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

export default function UserProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = typeof params?.userId === "string" ? params.userId : "";
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const { t } = useTranslation("profile");
  const { t: tSearch } = useTranslation("search");
  const { t: tNav } = useTranslation("navigation");

  const [author, setAuthor] = useState<AuthorSummary | null>(null);
  const [follow, setFollow] = useState<FollowState | null>(null);
  const [posts, setPosts] = useState<AuthorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOwnProfile = authenticated && user?.id === userId;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [postsRes, followsRes] = await Promise.all([
        fetch(`/api/posts?authorId=${encodeURIComponent(userId)}&limit=12`),
        fetch(`/api/follows?userId=${encodeURIComponent(userId)}`),
      ]);

      if (!postsRes.ok && !followsRes.ok) {
        setError(t("errorTitle"));
        return;
      }

      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data.items ?? []);
        if (data.items?.[0]?.author) {
          setAuthor(data.items[0].author as AuthorSummary);
        }
      }
      if (followsRes.ok) {
        setFollow(await followsRes.json());
      }
    } catch {
      setError(t("errorTitle"));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    if (!authLoading && authenticated) {
      load();
    } else if (!authLoading && !authenticated) {
      setLoading(false);
    }
  }, [authLoading, authenticated, load]);

  const handleFollow = async () => {
    await fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setFollow((f) => (f ? { ...f, isFollowing: true, followersCount: f.followersCount + 1 } : f));
  };

  const handleUnfollow = async () => {
    await fetch(`/api/follows?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    setFollow((f) => (f ? { ...f, isFollowing: false, followersCount: Math.max(0, f.followersCount - 1) } : f));
  };

  if (authLoading || (loading && authenticated)) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("title")} />
        <ProfileSkeleton />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("title")} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={t("title")} description={tNav("connectTelegram")} />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("title")} />
        <div className="flex flex-1 items-center justify-center">
          <ErrorState title={t("errorTitle")} message={error} onRetry={load} />
        </div>
        <BottomNav />
      </div>
    );
  }

  const shownAuthor: AuthorSummary | null =
    author ??
    (follow
      ? {
          id: userId,
          displayName: t("title"),
          avatarUrl: null,
          age: null,
          city: null,
          isVerified: false,
          isFollowing: false,
        }
      : null);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        title={shownAuthor?.displayName ?? t("title")}
        leading={
          <button
            onClick={() => router.back()}
            className="rounded-full p-2 -ms-2 text-muted transition-colors hover:text-fg"
            aria-label={tNav("backToApp")}
          >
            <svg className="h-5 w-5 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        }
      />

      <main className="mx-auto w-full max-w-2xl flex-1 pb-4">
        {/* Hero */}
        <section className="flex flex-col items-center px-4 pt-4 text-center">
          <Avatar
            src={shownAuthor?.avatarUrl}
            alt={shownAuthor?.displayName ?? t("title")}
            size="xl"
            ring
          />
          <div className="mt-3 flex items-center gap-1.5">
            <h2 className="font-display text-xl font-bold text-fg">
              {shownAuthor?.displayName ?? t("title")}
            </h2>
            {shownAuthor?.isVerified && (
              <svg className="h-4.5 w-4.5 text-accent-500" fill="currentColor" viewBox="0 0 24 24" aria-label={tSearch("verified")}>
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          {(shownAuthor?.age || shownAuthor?.city) && (
            <div className="mt-1 flex items-center gap-2 text-xs text-subtle">
              {shownAuthor?.age && <span>{shownAuthor.age}</span>}
              {shownAuthor?.age && shownAuthor?.city && <span aria-hidden>·</span>}
              {shownAuthor?.city && <span>{shownAuthor.city}</span>}
            </div>
          )}
        </section>

        {/* Stats */}
        <section className="mt-5 flex items-center justify-center gap-10 px-4">
          <div className="text-center">
            <p className="font-display text-lg font-bold text-fg">{follow?.followersCount ?? 0}</p>
            <p className="text-xs text-muted">{t("followers")}</p>
          </div>
          <div className="text-center">
            <p className="font-display text-lg font-bold text-fg">{follow?.followingCount ?? 0}</p>
            <p className="text-xs text-muted">{t("following")}</p>
          </div>
          <div className="text-center">
            <p className="font-display text-lg font-bold text-fg">{posts.length}</p>
            <p className="text-xs text-muted">{t("posts")}</p>
          </div>
        </section>

        {/* Actions */}
        {!isOwnProfile && (
          <section className="mt-4 flex items-center justify-center gap-2 px-4">
            <FollowButton
              userId={userId}
              isFollowing={follow?.isFollowing ?? false}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              size="md"
            />
          </section>
        )}

        {/* Posts */}
        <section className="mt-6 px-4">
          <h3 className="mb-3 font-display text-sm font-semibold text-fg">{t("tabVibes")}</h3>
          {posts.length === 0 ? (
            <EmptyState
              icon={
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              }
              title={t("emptyPostsTitle")}
              description={t("emptyPostsDescription")}
            />
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/feed?postId=${post.id}`}
                  className="surface-card block rounded-2xl p-4 transition-transform active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 flex-1 text-sm text-fg">
                      {post.caption ||
                        (post.postType === "video" ? "🎬" : "📷")}
                    </p>
                    <span className="shrink-0 text-xs text-muted">
                      {timeAgo(post.createdAt)}
                    </span>
                  </div>
                  {post.media.length > 0 && (
                    <div className="mt-2 flex gap-1.5">
                      {post.media.slice(0, 4).map((m) => (
                        <img
                          key={m.mediaId}
                          src={`/api/media/${m.mediaId}?derivative=thumbnail`}
                          alt=""
                          loading="lazy"
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span>♥ {post.likeCount}</span>
                    <span>💬 {post.commentCount}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
      <DesktopNav />
    </div>
  );
}
