import { getLanguage } from "./types";

export function formatDate(
  date: Date | string | number,
  locale = "en",
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toLocaleDateString(locale, options);
}

export function formatTime(
  date: Date | string | number,
  locale = "en",
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toLocaleTimeString(locale, options);
}

export function formatDateTime(
  date: Date | string | number,
  locale = "en",
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toLocaleString(locale, options);
}

export function formatRelativeTime(
  date: Date | string | number,
  locale = "en",
  now = Date.now(),
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffSec < 60) return rtf.format(-diffSec, "second");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return rtf.format(-diffHour, "hour");
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return rtf.format(-diffDay, "day");
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return rtf.format(-diffWeek, "week");
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return rtf.format(-diffMonth, "month");
  const diffYear = Math.floor(diffDay / 365);
  return rtf.format(-diffYear, "year");
}

export function formatNumber(
  value: number,
  locale = "en",
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCurrency(
  value: number,
  currency = "XTR",
  locale = "en",
): string {
  if (currency === "XTR") {
    return `⭐ ${formatNumber(value, locale)}`;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercentage(
  value: number,
  locale = "en",
): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function formatDistance(
  value: number,
  unit: "km" | "mi" = "km",
  locale = "en",
): string {
  if (unit === "mi") {
    const miles = value * 0.621371;
    return `${formatNumber(miles, locale, { maximumFractionDigits: 1 })} mi`;
  }
  return `${formatNumber(value, locale, { maximumFractionDigits: 0 })} km`;
}

export function formatCompactNumber(
  value: number,
  locale = "en",
): string {
  if (value >= 1_000_000) {
    return formatNumber(value / 1_000_000, locale, { maximumFractionDigits: 1 }) + "M";
  }
  if (value >= 1_000) {
    return formatNumber(value / 1_000, locale, { maximumFractionDigits: 1 }) + "K";
  }
  return formatNumber(value, locale);
}

export function formatAge(dateOfBirth: string | Date, locale = "en"): number {
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}
