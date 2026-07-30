"use client";

import { useState, useRef, useEffect } from "react";
import { SUPPORTED_LANGUAGES, FALLBACK_LANGUAGE, saveLanguagePreference, clearLanguagePreference, type Language } from "@/lib/i18n";
import { useI18n } from "./i18n-provider";

interface LanguageSelectorProps {
  align?: "left" | "right";
  showLabel?: boolean;
  className?: string;
  variant?: "dropdown" | "list" | "modal";
  onClose?: () => void;
}

export function LanguageSelector({
  align = "right",
  showLabel = true,
  className = "",
  variant = "dropdown",
  onClose,
}: LanguageSelectorProps) {
  const { locale, setLocale, loading } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === locale) ?? SUPPORTED_LANGUAGES[0];

  const handleChange = async (code: string) => {
    await setLocale(code);
    setOpen(false);
    onClose?.();
  };

  if (variant === "list") {
    return (
      <div className={`space-y-1 ${className}`}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            disabled={loading}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              locale === lang.code
                ? "bg-[var(--tg-theme-button-color,#0088cc)]/10 text-[var(--tg-theme-button-color,#0088cc)] font-medium"
                : "text-[var(--tg-theme-text-color,#000000)] hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            <span className="w-7 text-center text-base">
              {getLanguageFlag(lang.code)}
            </span>
            <div className="flex-1 text-left">
              <p className="text-sm">{lang.nativeName}</p>
              <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">{lang.name}</p>
            </div>
            {lang.dir === "rtl" && (
              <span className="text-xs text-[var(--tg-theme-hint-color,#999999)] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                RTL
              </span>
            )}
          </button>
        ))}
        <button
          onClick={async () => {
            clearLanguagePreference();
            await setLocale(FALLBACK_LANGUAGE);
            onClose?.();
          }}
          className="w-full text-left px-3 py-2.5 text-sm text-[var(--tg-theme-hint-color,#999999)] hover:text-[var(--tg-theme-text-color,#000000)] transition-colors border-t border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] mt-1 pt-3"
        >
          Use default language
        </button>
      </div>
    );
  }

  if (variant === "modal") {
    return (
      <div className={className}>
        {showLabel && (
          <h2 className="text-lg font-semibold mb-4 text-[var(--tg-theme-text-color,#000000)]">
            Select Language
          </h2>
        )}
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleChange(lang.code)}
              disabled={loading}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${
                locale === lang.code
                  ? "bg-[var(--tg-theme-button-color,#0088cc)]/10 text-[var(--tg-theme-button-color,#0088cc)] font-medium"
                  : "text-[var(--tg-theme-text-color,#000000)] hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <span className="text-xl">{getLanguageFlag(lang.code)}</span>
              <div className="flex-1 text-left">
                <p className="font-medium">{lang.nativeName}</p>
                <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">{lang.name}</p>
              </div>
              {locale === lang.code && (
                <span className="text-[var(--tg-theme-button-color,#0088cc)]">✓</span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={async () => {
            clearLanguagePreference();
            await setLocale(FALLBACK_LANGUAGE);
            onClose?.();
          }}
          className="w-full text-left px-3 py-3 text-sm text-[var(--tg-theme-hint-color,#999999)] hover:text-[var(--tg-theme-text-color,#000000)] transition-colors border-t border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] mt-2 pt-3"
        >
          Use app default ({SUPPORTED_LANGUAGES[0].nativeName})
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--tg-theme-text-color,#000000)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <span>{getLanguageFlag(current.code)}</span>
        {showLabel && <span>{current.nativeName}</span>}
        <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1 w-56 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg py-1 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleChange(lang.code)}
              disabled={loading}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                locale === lang.code
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              <span className="text-base">{getLanguageFlag(lang.code)}</span>
              <span className="flex-1 text-left">{lang.nativeName}</span>
              <span className="text-xs text-gray-400">{lang.name}</span>
              {locale === lang.code && <span className="text-blue-500">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getLanguageFlag(code: string): string {
  const flags: Record<string, string> = {
    en: "🇬🇧",
    bn: "🇧🇩",
    hi: "🇮🇳",
    ar: "🇸🇦",
    es: "🇪🇸",
    pt: "🇧🇷",
    id: "🇮🇩",
    tr: "🇹🇷",
    fr: "🇫🇷",
  };
  return flags[code] ?? "🌐";
}
