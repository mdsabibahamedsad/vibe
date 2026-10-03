import type { ReactNode } from "react";

/**
 * Skeleton loading system.
 *
 * Structure-preserving placeholders instead of full-screen spinners.
 * Uses the `.skeleton` utility (shimmer wave) defined in globals.css,
 * which respects `prefers-reduced-motion` globally.
 */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Generic labeled loading block with header/footer rows. */
function SkeletonRows({ rows, className = "" }: { rows: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

/** Feed — one skeleton per post card. */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4 px-4 py-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface-card rounded-2xl p-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
          <Skeleton className="mt-3 aspect-[4/3] w-full rounded-xl" />
          <div className="mt-4 flex items-center gap-5">
            <Skeleton className="h-8 w-14 rounded-full" />
            <Skeleton className="h-8 w-14 rounded-full" />
            <Skeleton className="h-8 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Profile — hero stats + tabs + post grid. */
export function ProfileSkeleton() {
  return (
    <div className="px-4 py-4" aria-hidden>
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="mt-5 flex justify-center gap-8">
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
      </div>
      <Skeleton className="mt-5 h-9 w-full rounded-full" />
      <div className="mt-5 grid grid-cols-3 gap-1">
        <Skeleton className="aspect-square rounded-lg" />
        <Skeleton className="aspect-square rounded-lg" />
        <Skeleton className="aspect-square rounded-lg" />
      </div>
    </div>
  );
}

/** Chat list — conversation rows. */
export function ChatSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="divide-y divide-divider px-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3.5">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Search / discovery results. */
export function SearchSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3 px-4 py-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface-card flex items-center gap-3 rounded-2xl p-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-44" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Notifications — grouped rows with avatars. */
export function NotificationSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-divider px-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-3.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stories rail — gradient rings. */
export function StorySkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-3 px-4 py-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}

/** Full-page skeleton with optional children (header) above it. */
export function PageSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {children}
      <SkeletonRows rows={6} className="p-4" />
    </div>
  );
}
