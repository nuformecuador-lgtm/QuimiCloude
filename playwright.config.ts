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
 * Cuota de login del `next dev` que arranca este runner, solo para el E2E (QC-73,
 * `design.md > 8`). Sin subirla, el propio E2E se frenaria a si mismo: TODA la bateria existente
 * que toca `/login` sin mandar `x-forwarded-for` cae en el mismo origen comun "desconocido"
 * (`progress/impl_QC-73-limite-de-peticiones-por-origen.md > T12, punto 2`), y con el valor por
 * defecto (30) un solo archivo lo agotaria.
 *
 * Contado en `progress/impl_QC-73-limite-de-peticiones-por-origen.md > T15` (log de peticiones
 * de `next dev` durante la bateria completa sin este spec): 227 peticiones a `/login` sumando
 * Chromium y WebKit -que comparten ese origen comun-, ~113 por proyecto (navegaciones directas,
 * envios de formulario y redirecciones desde rutas privadas sin sesion). 350 deja un margen del
 * ~54% sobre esa cuenta. No mas alto: el propio spec de este ticket (`e2e/rate-limit.spec.ts`)
 * tiene que agotarlo con peticiones reales contra `next dev` -subirlo mas alarga el propio E2E
 * sin necesidad, tal como advierte `design.md > 11`, punto 4-.
 */
export const E2E_RATE_LIMIT_LOGIN_MAX = 350

/**
 * Cuota general del mismo `next dev`. El origen comun "desconocido" tambien la consume con cada
 * navegacion, peticion RSC y Server Action del RESTO de la bateria. El log de `next dev` registra
 * 373 peticiones fuera de `/login` en toda la bateria, pero es una cota INFERIOR: el middleware
 * puede contar lo que `next dev` no registra (p. ej. la conexion de recarga en caliente de cada
 * pagina, que el `matcher` no excluye), y no hay forma de medir el pico por ventana de 60 s.
 * Subirla es una precaucion, no una necesidad medida: evita que un freno general -que no es lo que
 * esta ficha prueba- tumbe un E2E ajeno. Ampliacion de `design.md > 8`, anotada como desviacion en
 * `progress/impl_QC-73-limite-de-peticiones-por-origen.md > T15`.
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
      // Vacias a proposito (QC-73, D8): sin credenciales de Upstash el contador vive en la
      // memoria de este `next dev`, nunca en la cuenta real, aunque el entorno de quien corre el
      // E2E tenga algo cargado en `.env`.
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
  },
})
