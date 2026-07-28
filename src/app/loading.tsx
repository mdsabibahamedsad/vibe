export default function LoadingPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--tg-theme-button-color,#0088cc)] border-t-transparent" />
        <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">Loading...</p>
      </div>
    </div>
  );
}
