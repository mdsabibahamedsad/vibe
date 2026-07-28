import type { ImgHTMLAttributes } from "react";

type AvatarSize = "sm" | "md" | "lg" | "xl";

interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "size" | "src"> {
  src?: string | null;
  alt: string;
  size?: AvatarSize;
  fallback?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-base",
  xl: "w-20 h-20 text-xl",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Avatar({ src, alt, size = "md", fallback, className = "", ...props }: AvatarProps) {
  const initials = fallback ?? getInitials(alt);

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`rounded-full object-cover ${sizeClasses[size]} ${className}`}
        {...props}
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-[var(--tg-theme-button-color,#0088cc)] flex items-center justify-center text-white font-medium ${sizeClasses[size]} ${className}`}
      title={alt}
    >
      {initials}
    </div>
  );
}
