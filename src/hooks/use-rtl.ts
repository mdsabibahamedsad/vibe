"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { rtlAware, type Direction } from "@/lib/i18n/rtl";

export function useRtl() {
  const { dir, isRtl } = useI18n();
  const direction = dir as Direction;

  const rtl = useMemo(() => rtlAware(direction), [direction]);

  return {
    dir: direction,
    isRtl,
    rtl,
  };
}
