export interface Language {
  code: string;
  name: string;
  nativeName: string;
  dir: "ltr" | "rtl";
  pluralRule: (n: number) => number;
}

export interface TranslationResource {
  [namespace: string]: {
    [key: string]: string | TranslationResource[string];
  };
}

export interface TranslationEntry {
  id: string;
  namespace: string;
  key: string;
  value: string;
  language: string;
  isPublished: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface TranslationMeta {
  language: string;
  namespace: string;
  version: number;
  totalKeys: number;
  translatedKeys: number;
  isPublished: boolean;
  updatedAt: string;
}

export type I18nNamespace =
  | "common"
  | "navigation"
  | "settings"
  | "premium"
  | "admin"
  | "onboarding"
  | "notifications"
  | "feed"
  | "discover"
  | "dating"
  | "chat"
  | "stories"
  | "search"
  | "profile"
  | "creator"
  | "help"
  | "support"
  | "moderation"
  | "errors"
  | "time"
  | "billing"
  | "ads"
  | "security"
  | "referrals";

export const FALLBACK_LANGUAGE = "en";

export const SUPPORTED_LANGUAGES: Language[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    dir: "ltr",
    pluralRule: (n) => (n === 1 ? 0 : 1),
  },
  {
    code: "bn",
    name: "Bengali",
    nativeName: "বাংলা",
    dir: "ltr",
    pluralRule: (n) => (n === 1 ? 0 : 1),
  },
  {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    dir: "ltr",
    pluralRule: (n) => (n === 1 ? 0 : 1),
  },
  {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    dir: "rtl",
    pluralRule: (n) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n % 100 >= 3 && n % 100 <= 10 ? 3 : n % 100 >= 11 ? 4 : 5),
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    dir: "ltr",
    pluralRule: (n) => (n === 1 ? 0 : 1),
  },
  {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    dir: "ltr",
    pluralRule: (n) => (n === 1 ? 0 : 1),
  },
  {
    code: "id",
    name: "Indonesian",
    nativeName: "Bahasa Indonesia",
    dir: "ltr",
    pluralRule: (n) => 0,
  },
  {
    code: "tr",
    name: "Turkish",
    nativeName: "Türkçe",
    dir: "ltr",
    pluralRule: (n) => (n === 1 ? 0 : 1),
  },
  {
    code: "fr",
    name: "French",
    nativeName: "Français",
    dir: "ltr",
    pluralRule: (n) => (n === 1 ? 0 : n >= 2 ? 1 : 0),
  },
];

export function getLanguage(code: string): Language {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0];
}

export function isRtl(code: string): boolean {
  return getLanguage(code).dir === "rtl";
}
