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
          ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
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
