import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      {icon && <div className="text-[var(--tg-theme-hint-color,#999999)]">{icon}</div>}
      <h3 className="text-lg font-medium text-[var(--tg-theme-text-color,#000000)]">{title}</h3>
      {description && (
        <p className="max-w-xs text-sm text-[var(--tg-theme-hint-color,#999999)]">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
