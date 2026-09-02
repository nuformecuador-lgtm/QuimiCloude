import { defineConfig, devices } from '@playwright/test'

/**
 * Puerto propio del E2E, distinto del 3000 del `pnpm run dev` de todos los dias.
 *
 * En este repo se trabaja con varios worktrees a la vez (`docs/worktrees.md`), y con
 * `reuseExistingServer` en local Playwright se enganchaba a cualquier `next dev` que ya
 * ocupara el 3000 — que puede ser el de OTRA rama. Ese verde (o ese rojo) afirma sobre
 * codigo ajeno y no se distingue de uno bueno: el peor tipo de falso verde. Puerto propio
 * y `reuseExistingServer: false` tambien en local: el E2E arranca SIEMPRE el servidor de
 * este worktree, y si el puerto esta ocupado falla ruidosamente en vez de mentir.
 */
const E2E_PORT = 3117
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`

// Runner E2E del flujo de autenticacion (QC-7, aprobado en `design.md > 6.4`).
//
// Dos proyectos y no uno: Chromium cubre Chrome/Edge y Android, y WEBKIT es el motor de
// iOS — la regla multiplataforma de `docs/architecture.md > Componentes` pide ejercitar
// de verdad ese navegador, no suponer que la cookie se comporta igual en Safari.
//
// `webServer` levanta `next dev` porque el E2E prueba el flujo real (Server Action,
// redireccion y cookie emitida por el servidor), no un mock: sin servidor no hay nada que
// afirmar. El timeout es generoso porque el primer arranque de Next compila la ruta bajo
// demanda.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // `pnpm run dev` es `next dev`, asi que los argumentos extra llegan tal cual a Next.
    command: `pnpm run dev --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
