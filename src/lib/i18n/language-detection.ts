import { FALLBACK_LANGUAGE, type Language } from "./types";

export async function detectLanguage(): Promise<string> {
  const fromStorage = getSavedLanguage();
  if (fromStorage) return fromStorage;

  const fromTelegram = getTelegramLocale();
  if (fromTelegram && isValidLanguage(fromTelegram)) return fromTelegram;

  const fromBrowser = getBrowserLocale();
  if (fromBrowser && isValidLanguage(fromBrowser)) return fromBrowser;

  return FALLBACK_LANGUAGE;
}

export function getSavedLanguage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const lang = localStorage.getItem("vibe_language");
    if (lang && isValidLanguage(lang)) return lang;
    return null;
  } catch {
    return null;
  }
}

export function saveLanguagePreference(language: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("vibe_language", language);
  } catch {
    // Storage unavailable
  }
}

export function clearLanguagePreference(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("vibe_language");
  } catch {
    // Storage unavailable
  }
}

function getTelegramLocale(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.language_code) {
      return tg.initDataUnsafe.user.language_code.split("-")[0];
    }
    return null;
  } catch {
    return null;
  }
}

function getBrowserLocale(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const lang = navigator.language || (navigator as any).userLanguage;
    if (lang) return lang.split("-")[0];
    return null;
  } catch {
    return null;
  }
}

function isValidLanguage(code: string): boolean {
  const { SUPPORTED_LANGUAGES } = require("./types");
  return SUPPORTED_LANGUAGES.some((l: Language) => l.code === code);
}
