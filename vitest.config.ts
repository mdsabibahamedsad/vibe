import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest configuration for the Vibe project.
 *
 * - Resolves the `@/` path alias so tests can import application modules
 *   exactly like the app does (webpack/Turbopack tsconfig paths).
 * - Defaults to the Node environment (unit tests do not need a DOM).
 *   Component tests that need a DOM can override per-file with
 *   `// @vitest-environment jsdom`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
