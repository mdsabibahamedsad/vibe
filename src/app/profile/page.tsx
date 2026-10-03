"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ProfileSkeleton } from "@/components/ui";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface ProfileData {
  displayName: string;
  bio: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  isVerified: boolean;
  profileCompletionPct: number;
  photos: { id: string; mediaId: string | null; isPrimary: boolean }[];
  interests: { id: string; name: string }[];
  createdAt: string;
}

interface FollowStats {
  followersCount: number;
  followingCount: number;
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

export default function ProfilePage() {
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const { t } = useTranslation("profile");
  const { t: tNav } = useTranslation("navigation");
  const { t: tFeed } = useTranslation("feed");
  const [tab, setTab] = useState<"vibes" | "media">("vibes");

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<FollowStats | null>(null);
  const [posts, setPosts] = useState<AuthorPost[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRes, followsRes, postsRes] = await Promise.all([
        fetch("/api/profile"),
        fetch(`/api/follows?userId=${user.id}`),
        fetch(`/api/posts?authorId=${user.id}&limit=12`),
      ]);

      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
      }
      if (followsRes.ok) {
        setStats(await followsRes.json());
      }
      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data.items ?? []);
      }
      if (!profileRes.ok && !postsRes.ok) {
        setError(t("errorTitle"));
      }
    } catch {
      setError(t("errorTitle"));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    if (!authLoading && user) {
      load();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [authLoading, user, load]);

  if (authLoading || (loading && authenticated)) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("title")} />
        <ProfileSkeleton />
        <BottomNav />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("title")} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={t("title")} description={t("noBio")} />
        </div>
        <BottomNav />
      </div>
    );
  }

  const primaryPhoto = profile?.photos?.find((p) => p.isPrimary) ?? profile?.photos?.[0];
  const mediaPosts = posts?.filter((p) => p.media.length > 0) ?? [];
  const shownPosts = tab === "media" ? mediaPosts : (posts ?? []);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        title={t("title")}
        actions={
          <Link
            href="/settings"
            aria-label={t("settings")}
            className="rounded-full p-2 text-muted transition-colors hover:text-fg"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        }
      />

      <main className="flex-1 pb-4">
        {error && !profile ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-danger/10">
              <svg className="h-8 w-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="mb-4 text-sm text-muted">{error}</p>
            <button
              onClick={load}
              className="rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              {tNav("home.retry")}
            </button>
          </div>
        ) : (
          <>
            {/* Hero */}
            <section className="flex flex-col items-center px-4 pt-4 text-center">
              <Avatar
                src={primaryPhoto?.mediaId}
                alt={profile?.displayName ?? user.displayName}
                size="xl"
                ring
              />
              <div className="mt-3 flex items-center gap-1.5">
                <h2 className="font-display text-xl font-bold text-fg">
                  {profile?.displayName ?? user.displayName}
                </h2>
                {profile?.isVerified && (
                  <svg className="h-4.5 w-4.5 text-accent-500" fill="currentColor" viewBox="0 0 24 24" aria-label="Verified">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <p className="mt-0.5 max-w-xs text-sm leading-relaxed text-muted">
                {profile?.bio || t("noBio")}
              </p>
              {(profile?.city || profile?.age) && (
                <div className="mt-2 flex items-center gap-2 text-xs text-subtle">
                  {profile?.age && <span>{profile.age}</span>}
                  {profile?.age && profile?.city && <span aria-hidden>·</span>}
                  {profile?.city && <span>{profile.city}</span>}
                </div>
              )}
            </section>

            {/* Stats */}
            <section className="mt-5 flex items-center justify-center gap-10 px-4">
              <div className="text-center">
                <p className="font-display text-lg font-bold text-fg">
                  {stats?.followersCount ?? 0}
                </p>
                <p className="text-xs text-muted">{t("followers")}</p>
              </div>
              <div className="text-center">
                <p className="font-display text-lg font-bold text-fg">
                  {stats?.followingCount ?? 0}
                </p>
                <p className="text-xs text-muted">{t("following")}</p>
              </div>
              <div className="text-center">
                <p className="font-display text-lg font-bold text-fg">{posts?.length ?? 0}</p>
                <p className="text-xs text-muted">{t("posts")}</p>
              </div>
            </section>

            {/* Completion hint */}
            {profile && profile.profileCompletionPct < 100 && (
              <div className="mx-4 mt-4">
                <Link
                  href="/onboarding"
                  className="surface-card flex items-center justify-between rounded-2xl px-4 py-3 transition-transform active:scale-[0.98]"
                >
                  <div className="flex-1 text-start">
                    <p className="text-sm font-semibold text-fg">{t("completeProfile")}</p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-brand-gradient transition-all"
                        style={{ width: `${profile.profileCompletionPct}%` }}
                      />
                    </div>
                  </div>
                  <svg className="ms-2 h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            )}

            {/* Actions */}
            <section className="mt-4 flex items-center justify-center gap-2 px-4">
              <Link
                href="/settings"
                className="flex-1 rounded-full bg-brand-gradient py-2.5 text-center text-sm font-semibold text-white shadow-glow transition-transform active:scale-95"
              >
                {t("editProfile")}
              </Link>
            </section>

            {/* Tabs */}
            <section className="mt-6 px-4">
              <div className="flex gap-1 rounded-full bg-surface-2 p-1">
                {(
                  [
                    { key: "vibes", label: t("tabVibes") },
                    { key: "media", label: t("tabMedia") },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    aria-selected={tab === item.key}
                    role="tab"
                    className={`flex-1 rounded-full py-2 text-sm font-semibold transition-all ${
                      tab === item.key
                        ? "bg-surface text-fg shadow-soft"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Posts */}
            <section className="mt-4 px-4">
              {shownPosts.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  }
                  title={t("emptyPostsTitle")}
                  description={t("emptyPostsDescription")}
                  action={
                    <Link
                      href="/create"
                      className="mt-3 inline-flex items-center justify-center rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform active:scale-95"
                    >
                      {tFeed("createPost")}
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {shownPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/feed?postId=${post.id}`}
                      className="surface-card block rounded-2xl p-4 transition-transform active:scale-[0.99]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 flex-1 text-sm text-fg">
                          {post.caption || (post.postType === "text" ? "" : post.postType === "video" ? "🎬" : "📷")}
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
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
