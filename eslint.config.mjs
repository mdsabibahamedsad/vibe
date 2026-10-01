import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Vibe — flat ESLint configuration (Next.js 16 + ESLint 10 compatible).
 *
 * Next.js 16 removed the `next lint` CLI command. ESLint must be run
 * directly (`eslint .`), and the config must be a flat config array.
 * eslint-config-next ships native flat configs (`core-web-vitals` and
 * `typescript`) that we compose here — no legacy FlatCompat shim needed.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "coverage/**",
    ".vercel/**",
    ".freebuff/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "react/display-name": "off",
      // eslint-config-next 16 enables the new React Compiler-powered hooks rules
      // (set-state-in-effect, static-components, immutability, refs, purity).
      // These flag long-standing intentional patterns across the codebase
      // (e.g. syncing state from props/context in effects) and the React Compiler
      // itself is NOT enabled in next.config.mjs. Keep them visible as warnings
      // so they don't block `npm run lint` on pre-existing code, while new code
      // is still encouraged to follow them.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
