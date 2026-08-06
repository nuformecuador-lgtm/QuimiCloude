import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

// Mismo alias que `tsconfig.json`: `@/*` -> raiz del repo.
const alias = { '@': rootDir }

const exclude = ['node_modules/**', '.next/**', '.worktrees/**', 'dist/**']

// Dos entornos, una sola config (decision humana del 2026-08-06, ver
// `progress/current.md > Conflictos pendientes`). Las features 1 y 7 corrieron en
// paralelo y cada una monto Vitest por su cuenta: la 1 con `environment: 'node'`
// para esquema e integracion, la 7 con `jsdom` para la UI. No son compatibles en un
// solo entorno, asi que se separan en `projects` en vez de que una pise a la otra.
//
// El reparto es por convencion de nombre y carpeta, no por lista de archivos:
//   - todo `*.test.tsx`, y cualquier cosa bajo `tests/ui/`, corre en jsdom
//   - el resto corre en node
// Asi un test nuevo cae solo en el proyecto correcto sin tocar esta config.
export default defineConfig({
  resolve: { alias },
  test: {
    // En la raiz y no por proyecto: `ProjectConfig` no admite `passWithNoTests`.
    // Hace falta porque `vitest run guard` (y `test:rapido`) filtran por nombre y
    // dejan a uno de los dos proyectos sin ningun archivo seleccionado — eso no es
    // un fallo, un fallo es un test rojo.
    passWithNoTests: true,
    // `vitest run guard` filtra por nombre de archivo y debe seguir viendo las
    // guardias de ambos proyectos.
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
          include: ['tests/**/*.test.tsx', 'tests/ui/**/*.test.ts'],
          exclude,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          include: ['tests/**/*.test.ts'],
          exclude: [...exclude, 'tests/ui/**'],
        },
      },
    ],
  },
})
