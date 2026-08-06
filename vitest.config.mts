import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    // Mismo alias que `tsconfig.json`: `@/*` -> raiz del repo.
    alias: { '@': rootDir },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**', '.worktrees/**', 'dist/**'],
    // La suite se monta con esta feature: mientras los archivos de test no existan,
    // `vitest run` no puede devolver rojo por no encontrar nada.
    passWithNoTests: true,
  },
})
