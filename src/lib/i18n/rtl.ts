import { isRtl } from "./types";

export type Direction = "ltr" | "rtl";

const rtlFlippedProperties = [
  "marginLeft", "marginRight",
  "paddingLeft", "paddingRight",
  "left", "right",
  "borderLeft", "borderRight",
  "borderLeftWidth", "borderRightWidth",
  "borderLeftColor", "borderRightColor",
  "borderTopLeftRadius", "borderTopRightRadius",
  "borderBottomLeftRadius", "borderBottomRightRadius",
];

export function getDirectionalValue(ltrValue: string, rtlValue: string, dir: Direction): string {
  return dir === "rtl" ? rtlValue : ltrValue;
}

export function getDirectionalClass(base: string, dir: Direction): string {
  if (dir === "ltr") return base;
  return base
    .replace(/left/g, "right")
    .replace(/right/g, "left")
    .replace(/start/g, "end")
    .replace(/end/g, "start");
}

export function rtlFlipTransform(dir: Direction): string {
  return dir === "rtl" ? "scaleX(-1)" : "none";
}

export const rtlAware = (dir: "ltr" | "rtl") => ({
  isRtl: dir === "rtl",
  marginStart: (value: string) => dir === "rtl" ? { marginRight: value } : { marginLeft: value },
  marginEnd: (value: string) => dir === "rtl" ? { marginLeft: value } : { marginRight: value },
  paddingStart: (value: string) => dir === "rtl" ? { paddingRight: value } : { paddingLeft: value },
  paddingEnd: (value: string) => dir === "rtl" ? { paddingLeft: value } : { paddingRight: value },
  start: (value: string) => dir === "rtl" ? { right: value } : { left: value },
  end: (value: string) => dir === "rtl" ? { left: value } : { right: value },
  borderRadiusStart: (value: string) => dir === "rtl"
    ? { borderTopRightRadius: value, borderBottomRightRadius: value }
    : { borderTopLeftRadius: value, borderBottomLeftRadius: value },
  borderRadiusEnd: (value: string) => dir === "rtl"
    ? { borderTopLeftRadius: value, borderBottomLeftRadius: value }
    : { borderTopRightRadius: value, borderBottomRightRadius: value },
  transform: dir === "rtl" ? "scaleX(-1)" : "none",
  textAlign: (align: "start" | "end" | "left" | "right") => {
    if (align === "start") return dir === "rtl" ? "right" as const : "left" as const;
    if (align === "end") return dir === "rtl" ? "left" as const : "right" as const;
    return align;
  },
  flexDirection: dir === "rtl" ? "row-reverse" as const : "row" as const,
});
