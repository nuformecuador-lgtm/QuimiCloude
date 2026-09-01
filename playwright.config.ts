import { defineConfig, devices } from '@playwright/test'

// Runner E2E del flujo de autenticacion (QC-7, aprobado en `design.md > 6.4`).
//
// Dos proyectos y no uno: Chromium cubre Chrome/Edge y Android, y WEBKIT es el motor de
// iOS — la regla multiplataforma de `docs/architecture.md > Componentes` pide ejercitar
// de verdad ese navegador, no suponer que la cookie se comporta igual en Safari.
//
// `webServer` levanta `next dev` porque el E2E prueba el flujo real (Server Action,
// redireccion y cookie emitida por el servidor), no un mock: sin servidor no hay nada que
// afirmar. Con `reuseExistingServer` fuera de CI se aprovecha el `pnpm run dev` que ya
// pueda estar corriendo en local; en CI siempre se arranca uno limpio. El timeout es
// generoso porque el primer arranque de Next compila la ruta bajo demanda.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
