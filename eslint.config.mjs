import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees del arnes: cada uno es una copia completa del arbol. Sin esto, `pnpm
    // lint` recorre N copias de cada archivo y reporta los mismos errores N veces.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
