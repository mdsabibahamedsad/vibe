import type { ReactNode } from "react";

interface AppHeaderProps {
  title?: ReactNode;
  /** Show the gradient "Vibe" wordmark instead of a plain title. */
  brand?: boolean;
  actions?: ReactNode;
  /** Optional leading content (e.g. back button). */
  leading?: ReactNode;
}

export function AppHeader({ title, brand = false, actions, leading }: AppHeaderProps) {
  return (
    <header
      className="glass sticky top-0 z-20 border-b border-divider"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {leading}
          {brand ? (
            <h1 className="font-display text-xl font-bold text-gradient tracking-tight">
              Vibe
            </h1>
          ) : (
            title && (
              <h1 className="font-display text-lg font-semibold text-fg tracking-tight truncate">
                {title}
              </h1>
            )
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
