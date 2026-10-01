import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, type Language } from "./types";

export async function detectLanguage(): Promise<string> {
  const fromStorage = getSavedLanguage();
  if (fromStorage) return fromStorage;

  const fromTelegram = getTelegramLocale();
  if (fromTelegram && isValidLanguage(fromTelegram)) return fromTelegram;

  const fromBrowser = getBrowserLocale();
  if (fromBrowser && isValidLanguage(fromBrowser)) return fromBrowser;

  return FALLBACK_LANGUAGE;
}

/**
 * Safely access the real Web Storage API.
 *
 * We go through `window.localStorage` explicitly instead of the bare global:
 * Node.js >= 22 ships an experimental global `localStorage` that is a stub
 * without real methods, which would silently break storage access in
 * test environments (jsdom) where the global may not be shadowed.
 */
function getWebStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getSavedLanguage(): string | null {
  const storage = getWebStorage();
  if (!storage) return null;
  try {
    const lang = storage.getItem("vibe_language");
    if (lang && isValidLanguage(lang)) return lang;
    return null;
  } catch {
    return null;
  }
}

export function saveLanguagePreference(language: string): void {
  const storage = getWebStorage();
  if (!storage) return;
  try {
    storage.setItem("vibe_language", language);
  } catch {
    // Storage unavailable
  }
}

export function clearLanguagePreference(): void {
  const storage = getWebStorage();
  if (!storage) return;
  try {
    storage.removeItem("vibe_language");
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
  return SUPPORTED_LANGUAGES.some((l: Language) => l.code === code);
}
