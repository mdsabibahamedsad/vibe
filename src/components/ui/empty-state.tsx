import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
      {icon && (
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-gradient text-white shadow-glow animate-float">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl font-semibold text-fg tracking-tight">{title}</h3>
      {description && (
        <p className="max-w-xs text-sm text-muted leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
