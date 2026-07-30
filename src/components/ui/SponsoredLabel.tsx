/**
 * SponsoredLabel — Accessible label for sponsored/ad content.
 *
 * Every ad unit must display this label clearly to distinguish
 * paid content from organic content.
 *
 * The label is accessible to screen readers and visible to all users.
 */

interface SponsoredLabelProps {
  text?: string;
  isHouseCampaign?: boolean;
  className?: string;
}

export function SponsoredLabel({
  text = "Sponsored",
  isHouseCampaign = false,
  className = "",
}: SponsoredLabelProps) {
  return (
    <span
      role="status"
      aria-label={`Advertisement: ${text}`}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        isHouseCampaign
          ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
          : "bg-surface-2 text-muted"
      } ${className}`}
    >
      {text}
      {isHouseCampaign && (
        <span className="text-[8px] font-bold" aria-label="Vibe promotion">
          · Vibe
        </span>
      )}
    </span>
  );
}
