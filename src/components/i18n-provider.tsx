"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  FALLBACK_LANGUAGE,
  getLanguage,
  isRtl,
  detectLanguage,
  getSavedLanguage,
  saveLanguagePreference,
  loadNamespace,
  type I18nNamespace,
  type Language,
} from "@/lib/i18n";

interface I18nContextValue {
  locale: string;
  language: Language;
  dir: "ltr" | "rtl";
  isRtl: boolean;
  setLocale: (locale: string) => Promise<void>;
  loading: boolean;
  loadedNamespaces: Set<I18nNamespace>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const INITIAL_NAMESPACES: I18nNamespace[] = [
  "common",
  "navigation",
  "errors",
  "time",
];

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: string;
}) {
  const [locale, setLocaleState] = useState<string>(initialLocale ?? FALLBACK_LANGUAGE);
  const [loading, setLoading] = useState(true);
  const [loadedNamespaces, setLoadedNamespaces] = useState<Set<I18nNamespace>>(new Set());

  useEffect(() => {
    async function init() {
      const saved = getSavedLanguage();
      const lang = saved ?? initialLocale ?? (await detectLanguage());
      setLocaleState(lang);

      await Promise.all(
        INITIAL_NAMESPACES.map((ns) => loadNamespace(lang, ns)),
      );
      setLoadedNamespaces(new Set(INITIAL_NAMESPACES));
      setLoading(false);
    }
    init();
  }, [initialLocale]);

  const setLocale = useCallback(async (newLocale: string) => {
    setLoading(true);
    setLocaleState(newLocale);
    saveLanguagePreference(newLocale);

    const allNs = [...INITIAL_NAMESPACES, ...loadedNamespaces];
    const uniqueNs = [...new Set(allNs)] as I18nNamespace[];
    await Promise.all(uniqueNs.map((ns) => loadNamespace(newLocale, ns)));
    setLoadedNamespaces(new Set(uniqueNs));
    setLoading(false);
    document.documentElement.lang = newLocale;
    document.documentElement.dir = isRtl(newLocale) ? "rtl" : "ltr";
  }, [loadedNamespaces]);

  const language = getLanguage(locale);

  return (
    <I18nContext.Provider
      value={{
        locale,
        language,
        dir: language.dir,
        isRtl: language.dir === "rtl",
        setLocale,
        loading,
        loadedNamespaces,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}

export function useLocale(): string {
  return useI18n().locale;
}

export function useLanguage(): Language {
  return useI18n().language;
}

export function useDir(): "ltr" | "rtl" {
  return useI18n().dir;
}

export function useIsRtl(): boolean {
  return useI18n().isRtl;
}
