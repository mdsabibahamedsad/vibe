import { useState, type ImgHTMLAttributes } from "react";

type AvatarSize = "sm" | "md" | "lg" | "xl";

interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "size" | "src"> {
  src?: string | null;
  alt: string;
  size?: AvatarSize;
  fallback?: string;
  /** Wrap the avatar in a brand gradient ring. */
  ring?: boolean;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-base",
  xl: "w-20 h-20 text-xl",
};

const ringPadding: Record<AvatarSize, string> = {
  sm: "p-0.5",
  md: "p-[3px]",
  lg: "p-1",
  xl: "p-1.5",
};

/**
 * Resolve an avatar source into a loadable URL.
 *
 * Many API responses expose avatar references as raw media IDs (UUIDs from the
 * `media` table). A bare UUID is not a valid <img src>, so we route it through
 * the authenticated media endpoint. Absolute/data/blob URLs pass through
 * unchanged.
 */
export function resolveAvatarSrc(src: string): string {
  if (/^https?:\/\//.test(src) || src.startsWith("/") || src.startsWith("data:") || src.startsWith("blob:")) {
    return src;
  }
  // Bare media ID (UUID-ish) — serve via the media endpoint's thumbnail
  return `/api/media/${encodeURIComponent(src)}?derivative=thumbnail`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Avatar({ src, alt, size = "md", fallback, ring = false, className = "", ...props }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = fallback ?? getInitials(alt);

  const resolved = src ? resolveAvatarSrc(src) : null;
  const showImage = resolved !== null && !failed;

  const inner = showImage ? (
    <img
      src={resolved as string}
      alt={alt}
      className={`rounded-full object-cover ${sizeClasses[size]} ${className}`}
      onError={() => setFailed(true)}
      {...props}
    />
  ) : (
    <div
      className={`rounded-full bg-brand-gradient flex items-center justify-center text-white font-semibold ${sizeClasses[size]} ${className}`}
      title={alt}
      aria-label={alt}
    >
      {initials}
    </div>
  );

  if (ring) {
    return (
      <div className={`ring-gradient rounded-full ${ringPadding[size]}`}>
        <div className="rounded-full bg-bg p-0.5">{inner}</div>
      </div>
    );
  }

  return inner;
}
