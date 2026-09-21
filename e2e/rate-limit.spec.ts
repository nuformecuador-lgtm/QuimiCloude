/**
 * E2E del freno de peticiones por origen sobre el login.
 *
 * Que aporta sobre unit e integracion: el canal completo de una Server Action frenada llegando
 * intacta al navegador, y una navegacion frenada mostrando la pantalla de freno real, en
 * Chromium y en WebKit.
 *
 * ORIGEN PROPIO POR PROYECTO: el resto de la bateria E2E no manda `x-forwarded-for`, asi que cae
 * en el origen comun "desconocido" y por eso `playwright.config.ts` sube `RATE_LIMIT_LOGIN_MAX`
 * a `E2E_RATE_LIMIT_LOGIN_MAX` para no frenarla. Este spec necesita agotar su PROPIA cuota sin
 * tocar esa del resto, asi que manda su propia cabecera -un origen de documentacion (RFC 5737)
 * DISTINTO por proyecto, para que Chromium y WebKit no se la roben corriendo en paralelo-.
 *
 * CONTADOR EN MEMORIA, no Upstash: `playwright.config.ts` deja `UPSTASH_REDIS_REST_URL` y
 * `UPSTASH_REDIS_REST_TOKEN` vacias a proposito, asi que el freno que este spec agota es el de la
 * memoria de este `next dev`.
 */
import { expect, test } from '@playwright/test';

import { RATE_LIMITED_MESSAGE } from '@/lib/modules/rate-limit';
import { E2E_RATE_LIMIT_LOGIN_MAX } from '@/playwright.config';

/** Ruta publica del login. No hay constante para ella en `lib/shared/routes.ts`. */
const LOGIN_PATH = '/login';

/**
 * Un origen por proyecto: si los dos motores mandaran el mismo, correrian en paralelo sobre la
 * MISMA cuenta y uno frenaria al otro antes de que su propio test llegara al envio del
 * formulario. Direcciones de los bloques de documentacion de RFC 5737.
 */
const ORIGIN_BY_PROJECT: Record<string, string> = {
  chromium: '198.51.100.73',
  webkit: '203.0.113.55',
};

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda, y el bucle
// que agota la cuota manda cientos de peticiones antes de llegar al envio del formulario. Los dos
// proyectos comparten el mismo servidor, y en la bateria completa tambien con el resto de
// especificaciones.
test.setTimeout(240_000);

for (const [projectName, origin] of Object.entries(ORIGIN_BY_PROJECT)) {
  test.describe(`login frenado por origen (${projectName})`, () => {
    // Cada bloque corre SOLO en el proyecto al que pertenece su origen: en el otro se saltaria
    // igual, pero dejarlo entrar gastaria tiempo agotando una cuota de una cabecera que no es la
    // suya.
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== projectName, 'este origen es propio de otro proyecto');
    });

    // El origen sale de la cabecera del CONTEXTO: `page.goto` y `page.request` comparten el mismo
    // contexto de navegador, asi que los dos la mandan.
    test.use({ extraHTTPHeaders: { 'x-forwarded-for': origin } });

    test('agota la cuota de login: frena el formulario en la propia pantalla y la navegacion siguiente ve el 429 (R10, R11, R35)', async ({
      page,
    }) => {
      // --- 1. Primera peticion de la cuota: la navegacion al login.
      await page.goto(LOGIN_PATH);

      // --- 2. Gasta el resto de la cuota con peticiones baratas del MISMO contexto (misma
      // cabecera): del 2 al N_e2e, para que la siguiente (el envio del formulario) sea la
      // N_e2e + 1 y caiga ya frenada. El contador en memoria no tiene ningun `await` en su
      // camino critico (`in-memory-rate-limiter.ts`), asi que cuenta correctamente aunque estas
      // peticiones salgan en paralelo por lotes.
      //
      // Con `RSC: 1` y SIN seguir redirecciones: el middleware la cuenta en la MISMA cuota (el
      // cubo sale solo del `pathname`) y despues `next dev` la contesta con un 307 a
      // `/login?_rsc` sin renderizar nada, asi que cuesta ~15 ms frente a ~170 ms del HTML
      // completo (medido). Con el HTML completo los dos proyectos no llegaban al envio dentro del
      // timeout. `maxRedirects: 0` es obligatorio: siguiendo el 307, cada peticion de gasto
      // contaria DOS veces.
      const BATCH_SIZE = 25;
      const remaining = E2E_RATE_LIMIT_LOGIN_MAX - 1;
      for (let sent = 0; sent < remaining; sent += BATCH_SIZE) {
        const batch = Math.min(BATCH_SIZE, remaining - sent);
        const responses = await Promise.all(
          Array.from({ length: batch }, () =>
            page.request.get(LOGIN_PATH, { headers: { RSC: '1' }, maxRedirects: 0 }),
          ),
        );
        // Ninguna de las peticiones de gasto puede salir frenada: si alguna lo hiciera, la cuota
        // se habria agotado antes de tiempo y el envio no seria la peticion N_e2e + 1.
        for (const burned of responses) expect(burned.status()).not.toBe(429);
      }

      // --- 3. La Server Action del envio cae frenada. El mensaje neutro aparece SOBRE la propia
      // pantalla de login -sin navegar a otra, sin la pantalla de error generica-.
      await page.getByTestId('login-username').fill('cualquiera');
      await page.getByTestId('login-password').fill('cualquiera');
      await page.getByTestId('login-submit').click();

      await expect(page.getByText(RATE_LIMITED_MESSAGE)).toBeVisible({ timeout: 60_000 });
      expect(new URL(page.url()).pathname).toBe(LOGIN_PATH);

      // --- 4. La SIGUIENTE navegacion al login, todavia dentro de la misma ventana, ve la
      // pantalla de freno con 429 y el mismo mensaje.
      const response = await page.goto(LOGIN_PATH);
      expect(response?.status()).toBe(429);
      await expect(page.getByText(RATE_LIMITED_MESSAGE)).toBeVisible({ timeout: 60_000 });
    });
  });
}
