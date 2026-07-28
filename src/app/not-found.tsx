import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
        <span className="text-2xl font-bold text-[var(--tg-theme-hint-color,#999999)]">?</span>
      </div>
      <h2 className="text-xl font-semibold text-[var(--tg-theme-text-color,#000000)]">
        Page not found
      </h2>
      <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-[var(--tg-theme-button-color,#0088cc)] px-6 py-2 text-sm font-medium text-[var(--tg-theme-button-text-color,#ffffff)] transition-opacity hover:opacity-90"
      >
        Go home
      </Link>
    </div>
  );
}
