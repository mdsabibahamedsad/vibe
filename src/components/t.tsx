"use client";

import { useTranslation } from "@/lib/i18n/useTranslation";
import type { I18nNamespace } from "@/lib/i18n";

interface TProps {
  k: string;
  ns?: I18nNamespace;
  params?: Record<string, string | number>;
}

export function T({ k, ns = "common", params }: TProps) {
  const { t } = useTranslation(ns);
  return <>{t(k, params)}</>;
}

export function TPlural({
  singular,
  plural,
  count,
  ns = "common",
  params,
}: {
  singular: string;
  plural: string;
  count: number;
  ns?: I18nNamespace;
  params?: Record<string, string | number>;
}) {
  const { tp } = useTranslation(ns);
  return <>{tp(singular, plural, count, params)}</>;
}
