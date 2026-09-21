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

/**
 * Cuota de login solo para este runner E2E. El resto de la bateria comparte el origen comun
 * "desconocido" al no mandar `x-forwarded-for`, asi que con el valor por defecto (30) un solo
 * archivo la agotaria. Medido en el log de `next dev`: 227 peticiones a `/login` en la bateria
 * completa sin este spec (~113 por proyecto); 350 deja margen sin alargar mas de lo necesario el
 * propio spec, que tiene que poder agotarla con peticiones reales.
 */
export const E2E_RATE_LIMIT_LOGIN_MAX = 350

/**
 * Cuota general del mismo `next dev`: el origen comun "desconocido" tambien la gasta con cada
 * navegacion, peticion RSC y Server Action del resto de la bateria. El log registra 373
 * peticiones fuera de `/login`, pero es una cota inferior -el middleware cuenta trafico que
 * `next dev` no registra, como la recarga en caliente-. Subirla es una precaucion sin medida
 * exacta: evita que un freno general ajeno a este spec tumbe un E2E que no lo prueba.
 */
export const E2E_RATE_LIMIT_GENERAL_MAX = 5000

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
    env: {
      RATE_LIMIT_LOGIN_MAX: String(E2E_RATE_LIMIT_LOGIN_MAX),
      RATE_LIMIT_GENERAL_MAX: String(E2E_RATE_LIMIT_GENERAL_MAX),
      // Vacias a proposito: sin credenciales de Upstash el contador vive en la memoria de este
      // `next dev`, nunca en la cuenta real, aunque el entorno de quien corre el E2E tenga algo
      // cargado en `.env`.
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
  },
})
