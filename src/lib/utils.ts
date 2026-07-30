import { formatRelativeTime } from "@/lib/i18n/formatters";

export function cn(...inputs: (string | boolean | undefined | null)[]): string {
  return inputs.filter(Boolean).join(" ");
}

export function timeAgo(date: Date | string | number, locale = "en"): string {
  return formatRelativeTime(date, locale);
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}
