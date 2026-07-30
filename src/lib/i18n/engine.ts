import { FALLBACK_LANGUAGE, type I18nNamespace } from "./types";

type TranslationMap = Map<string, string>;

interface CacheEntry {
  resources: TranslationMap;
  version: number;
  loadedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

let loadedLanguages = new Set<string>();
let initialLoadDone = false;

function makeKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

function loadTranslationModule(language: string, namespace: string): Record<string, string> | null {
  try {
    const module = require(`./translations/${language}/${namespace}.json`);
    return module;
  } catch {
    return null;
  }
}

function flattenResource(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result[fullKey] = value;
    } else if (typeof value === "object" && value !== null) {
      Object.assign(result, flattenResource(value as Record<string, unknown>, fullKey));
    }
  }
  return result;
}

async function loadResource(
  language: string,
  namespace: string,
): Promise<TranslationMap> {
  const map = new Map<string, string>();

  const data = loadTranslationModule(language, namespace);
  if (data) {
    const flat = flattenResource(data as unknown as Record<string, unknown>);
    for (const [key, value] of Object.entries(flat)) {
      map.set(makeKey(namespace, key), value);
    }
  }

  return map;
}

export async function loadNamespace(
  language: string,
  namespace: I18nNamespace,
): Promise<void> {
  const cacheKey = `${language}:${namespace}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && now - cached.loadedAt < CACHE_TTL) {
    return;
  }

  const map = await loadResource(language, namespace);

  const fallbackMap = language !== FALLBACK_LANGUAGE
    ? await loadResource(FALLBACK_LANGUAGE, namespace)
    : new Map<string, string>();

  for (const [key, value] of fallbackMap) {
    if (!map.has(key)) {
      map.set(key, value);
    }
  }

  cache.set(cacheKey, { resources: map, version: 1, loadedAt: now });
  loadedLanguages.add(language);
}

export function preloadInitial(language: string, namespaces: I18nNamespace[]): void {
  if (initialLoadDone) return;
  initialLoadDone = true;
  for (const ns of namespaces) {
    loadNamespace(language, ns).catch(() => {});
  }
}

export function translate(
  key: string,
  params?: Record<string, string | number>,
  language?: string,
  namespace?: I18nNamespace,
): string {
  const ns = namespace ?? "common";
  const cacheKey = `${language ?? FALLBACK_LANGUAGE}:${ns}`;
  const cached = cache.get(cacheKey);

  let value: string | undefined;

  if (cached) {
    value = cached.resources.get(makeKey(ns, key));
  }

  if (value === undefined && language && language !== FALLBACK_LANGUAGE) {
    const fallbackKey = `${FALLBACK_LANGUAGE}:${ns}`;
    const fallback = cache.get(fallbackKey);
    if (fallback) {
      value = fallback.resources.get(makeKey(ns, key));
    }
  }

  if (value === undefined) {
    return key;
  }

  return interpolate(value, params);
}

export function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;

  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}

export function translatePlural(
  singular: string,
  plural: string,
  count: number,
  params?: Record<string, string | number>,
  language?: string,
): string {
  const template = count === 1 ? singular : plural;
  return interpolate(template, { ...params, count });
}

export function clearCache(): void {
  cache.clear();
  loadedLanguages.clear();
}

export function invalidateNamespace(language: string, namespace: string): void {
  const cacheKey = `${language}:${namespace}`;
  cache.delete(cacheKey);
}

export function getCacheStats(): {
  entries: number;
  languages: string[];
  namespaces: string[];
} {
  const languages = new Set<string>();
  const namespaces = new Set<string>();

  for (const key of cache.keys()) {
    const [lang, ns] = key.split(":");
    languages.add(lang);
    namespaces.add(ns);
  }

  return {
    entries: cache.size,
    languages: Array.from(languages),
    namespaces: Array.from(namespaces),
  };
}
