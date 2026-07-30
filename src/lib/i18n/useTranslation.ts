import { useCallback } from "react";
import { translate, translatePlural } from "./engine";
import { FALLBACK_LANGUAGE, type I18nNamespace } from "./types";
import { useI18n } from "@/components/i18n-provider";

export function useTranslation(namespace?: I18nNamespace) {
  const { locale } = useI18n();

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return translate(key, params, locale, namespace);
    },
    [locale, namespace],
  );

  const tp = useCallback(
    (singular: string, plural: string, count: number, params?: Record<string, string | number>) => {
      return translatePlural(singular, plural, count, params, locale);
    },
    [locale],
  );

  return { t, tp, locale };
}
