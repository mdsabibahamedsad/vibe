/**
 * Vitest global setup.
 *
 * 1. Loads .env.local into process.env so integration/security tests (which
 *    hit a running app server and build signed Telegram initData) have access
 *    to the same environment the app server uses. Existing env vars win.
 * 2. Installs a working in-memory Storage when Node's stub localStorage is
 *    unusable in the jsdom environment.
 */

// ---------------------------------------------------------------------------
// Env loading — tests share the app's .env.local (CI may inject vars directly)
// ---------------------------------------------------------------------------
try {
  // Lazy require keeps this file importable in browser-ish environments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config } = require("dotenv") as typeof import("dotenv");
  config({ path: ".env.local", quiet: true });
  // .env acts as a lower-precedence fallback (dotenv does not override).
  config({ path: ".env", quiet: true });
} catch {
  // dotenv not installed — tests that need env vars will fail with a clear
  // "not set in the test environment" error instead.
}


class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function installStorage(target: object): boolean {
  try {
    const existing = (target as { localStorage?: Storage }).localStorage;
    if (existing && typeof existing.setItem === "function") {
      return true; // Real Storage already available
    }
  } catch {
    // Access may throw (e.g. opaque origin) — replace it
  }

  try {
    Object.defineProperty(target, "localStorage", {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    return true;
  } catch {
    return false;
  }
}

installStorage(globalThis);

if (typeof window !== "undefined") {
  installStorage(window);
}
