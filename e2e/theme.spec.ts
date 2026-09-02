/**
 * E2E del anti-parpadeo del tema (QC-29, T12; `design.md > 8`, nivel 4).
 *
 * Que aporta sobre lo que ya cubren los tests unitarios (`theme-init-script.test.tsx`,
 * `theme-provider.test.tsx`): el navegador de verdad, en los dos motores configurados
 * (`playwright.config.ts` — chromium y webkit). Los unitarios evaluan `THEME_INIT_SCRIPT`
 * contra un DOM simulado y serializan el HTML del servidor; ninguno de los dos puede afirmar
 * que el navegador real **no llego a pintar** el modo equivocado en el primer fotograma. Un
 * screenshot comparado seria flaky y no distingue "tardo un frame" de "no parpadeo" — la sonda
 * de `requestAnimationFrame` responde exactamente esa pregunta.
 *
 * LA SONDA (nivel 4 de `design.md > 8`): `page.addInitScript` registra, en `document_start` —
 * antes de que corra ningun script de la pagina, incluido `THEME_INIT_SCRIPT` — un
 * `requestAnimationFrame` que guarda en `window.__firstFrameThemeClass` el `className` de
 * `document.documentElement` tal como esta en el PRIMER fotograma pintado. Si el modo
 * equivocado se hubiera pintado y luego corregido, ese primer fotograma no traeria la marca
 * esperada y el test fallaria. `addInitScript` se registra una sola vez por `page` y Playwright
 * lo reinyecta en `document_start` de cada navegacion siguiente, asi que sirve igual para el
 * escenario de R11 (varias rutas) sin volver a registrarlo.
 *
 * RUTA: todo el spec corre sobre `/login` (publica, sin sesion) — no hace falta autenticar
 * para demostrar R7, R9, R10, R11 y R17, y evita que el spec dependa de credenciales o de la
 * base de datos, que es justo lo que exige `docs/verification.md` para un E2E de UI pura.
 *
 * PRUEBA DE MORDIDA (`tasks.md > T12`): quitando el `<script>` del root layout, el primer
 * escenario (`no pinta el modo claro antes de aplicar el oscuro del sistema`) debe fallar,
 * porque sin el, un `system` oscuro solo se aplicaria despues de que React hidrate — ya tarde
 * para el primer fotograma. La corre el leader en el gate, no este archivo.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { THEME_COOKIE, THEME_DARK_CLASS } from '@/lib/shared/ui/theme-state';

const LOGIN_PATH = '/login';

/**
 * Arma la sonda de primer fotograma en `document_start`, antes de que se ejecute cualquier
 * script propio de la pagina (`THEME_INIT_SCRIPT` incluido). Se re-arma sola en cada
 * navegacion posterior porque `addInitScript` persiste para toda la vida de la `page`.
 */
async function armFirstFrameProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __firstFrameThemeClass?: string }).__firstFrameThemeClass = undefined;
    requestAnimationFrame(() => {
      (window as unknown as { __firstFrameThemeClass?: string }).__firstFrameThemeClass =
        document.documentElement.className;
    });
  });
}

/** Espera a que la sonda del primer fotograma haya escrito su valor. */
async function readFirstFrameThemeClass(page: Page): Promise<string> {
  await page.waitForFunction(
    () => (window as unknown as { __firstFrameThemeClass?: string }).__firstFrameThemeClass !== undefined,
  );
  return page.evaluate(
    () => (window as unknown as { __firstFrameThemeClass?: string }).__firstFrameThemeClass ?? '',
  );
}

function isDarkClassName(className: string): boolean {
  return className.split(/\s+/).includes(THEME_DARK_CLASS);
}

async function seedThemeCookie(
  context: BrowserContext,
  baseURL: string,
  value: 'light' | 'dark' | 'system',
): Promise<void> {
  const { hostname } = new URL(baseURL);
  await context.addCookies([
    {
      name: THEME_COOKIE,
      value,
      domain: hostname,
      path: '/',
    },
  ]);
}

test.describe('anti-parpadeo del tema en /login', () => {
  test('no pinta el modo claro antes de aplicar el oscuro del sistema', async ({ page }) => {
    // R10, R7 — sin cookie, el sistema operativo dice oscuro: el primer fotograma ya debe
    // traer la clase oscura, sin que React tenga que hidratar primero para corregirla.
    await page.emulateMedia({ colorScheme: 'dark' });
    await armFirstFrameProbe(page);

    await page.goto(LOGIN_PATH);

    const primerFotograma = await readFirstFrameThemeClass(page);
    expect(isDarkClassName(primerFotograma)).toBe(true);
  });

  test('conserva la preferencia guardada tras recargar y en una sesion nueva del navegador', async ({
    page,
    context,
    baseURL,
  }) => {
    // R9 — preferencia explicita `light` con el sistema operativo en oscuro: si la cookie no
    // se respetara, el sistema ganaria y el modo saldria oscuro.
    await page.emulateMedia({ colorScheme: 'dark' });
    await seedThemeCookie(context, baseURL ?? 'http://localhost:3000', 'light');
    await armFirstFrameProbe(page);

    await page.goto(LOGIN_PATH);
    expect(isDarkClassName(await readFirstFrameThemeClass(page))).toBe(false);

    await page.reload();
    expect(isDarkClassName(await readFirstFrameThemeClass(page))).toBe(false);

    // "Sesion nueva del navegador en el mismo perfil": un contexto nuevo que arranca con las
    // cookies persistidas del contexto actual, tal como haria un navegador real al reabrirse
    // con el mismo perfil de usuario.
    const storageState = await context.storageState();
    const freshContext = await page.context().browser()?.newContext({ storageState });
    expect(freshContext, 'el navegador no soporta un contexto nuevo').toBeDefined();

    try {
      const freshPage = await (freshContext as BrowserContext).newPage();
      await freshPage.emulateMedia({ colorScheme: 'dark' });
      await armFirstFrameProbe(freshPage);
      await freshPage.goto(LOGIN_PATH);

      expect(isDarkClassName(await readFirstFrameThemeClass(freshPage))).toBe(false);
    } finally {
      await (freshContext as BrowserContext).close();
    }
  });

  test('mantiene el modo al navegar entre rutas', async ({ page, context, baseURL }) => {
    // R11 — con preferencia explicita `dark`, cada navegacion debe repintar ya en oscuro desde
    // el primer fotograma, nunca claro-y-luego-oscuro.
    await seedThemeCookie(context, baseURL ?? 'http://localhost:3000', 'dark');
    await armFirstFrameProbe(page);

    await page.goto(LOGIN_PATH);
    expect(isDarkClassName(await readFirstFrameThemeClass(page))).toBe(true);

    await page.goto('/');
    expect(isDarkClassName(await readFirstFrameThemeClass(page))).toBe(true);

    await page.goto(LOGIN_PATH);
    expect(isDarkClassName(await readFirstFrameThemeClass(page))).toBe(true);
  });

  test('sigue el cambio de prefers-color-scheme mientras la preferencia es sistema', async ({
    page,
  }) => {
    // R17 — sin cookie (preferencia `system`), el proveedor de cliente reacciona al cambio de
    // `prefers-color-scheme` sin recargar la pagina.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(LOGIN_PATH);

    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(false);

    await page.emulateMedia({ colorScheme: 'dark' });

    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true);

    // Y sin haber navegado en ningun momento.
    expect(new URL(page.url()).pathname).toBe(LOGIN_PATH);
  });
});
