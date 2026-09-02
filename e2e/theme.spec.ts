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
 *
 * DOS AJUSTES POSTERIORES (hallazgo mayor del leader, rojo intermitente en frio):
 *
 * 1) La sonda del primer escenario (R10) guardaba solo el className del PRIMERISIMO
 *    `requestAnimationFrame`. Con `next dev` compilando en frio, el HTML llega en streaming y
 *    puede darse un frame antes de que el trozo con el `<script>` inline haya llegado siquiera
 *    — sobre un documento sin ningun contenido pintado todavia (`document.readyState ===
 *    'loading'`). Ese frame no es un parpadeo visible (no habia nada que ver), pero la sonda
 *    original no sabia distinguirlo y fallaba igual. Ahora `armFrameLog`/`readThemeFrames`
 *    registran TODOS los frames hasta `load` (mas uno final), cada uno con si el documento ya
 *    tenia contenido (`readyState !== 'loading'`), y el test solo exige el modo correcto en los
 *    frames CON contenido — que es lo que R10 pide de verdad ("no se ve el modo equivocado"),
 *    no "el primerisimo frame absoluto sin importar si habia algo que ver". No se sustituye por
 *    un `expect` del estado final: eso dejaria de detectar el parpadeo real.
 *
 * 2) El ultimo escenario (R17) cambiaba `page.emulateMedia` justo despues de `page.goto`, sin
 *    esperar a que React hidratara. Si el cambio de `prefers-color-scheme` llegaba antes de que
 *    el listener de `matchMedia` del proveedor existiera, el evento `change` se perdia y
 *    `expect.poll` agotaba sus 5s. Se agrega `waitForHydration`, que espera de forma
 *    deterministica (fibra de React presente en `<body>`) a que la app pueda reaccionar antes de
 *    tocar la emulacion. Esto NO ablanda R17: el requisito dice "mientras la pestaña esta
 *    abierta", y una pestaña que todavia no termino de montar la app no es el escenario que R17
 *    describe — es, ademas, un caso que el propio proveedor (`components/shared/
 *    theme-provider.tsx`) ahora cubre por separado re-sincronizando al montar.
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

type ThemeFrame = { className: string; hasContent: boolean };

/**
 * Arma, en `document_start`, un registro de TODOS los frames pintados hasta `load` (mas uno
 * final tras `load`), cada uno con si el documento ya tenia contenido en ese momento
 * (`readyState !== 'loading'`). Reemplaza la sonda de "primer frame absoluto" solo para el
 * escenario de R10 (ver docblock de cabecera): esa sonda podia capturar un frame previo a que
 * llegara siquiera el `<script>` inline, sobre un documento vacio, y eso no es el parpadeo que
 * R10 prohibe.
 */
async function armFrameLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: ThemeFrame[] = [];
    (window as unknown as { __themeFrames: ThemeFrame[] }).__themeFrames = frames;
    (window as unknown as { __themeFramesDone?: boolean }).__themeFramesDone = false;

    const capture = (): void => {
      frames.push({
        className: document.documentElement.className,
        hasContent: document.readyState !== 'loading',
      });
    };

    let loaded = false;
    window.addEventListener('load', () => {
      loaded = true;
    });

    const loop = (): void => {
      capture();
      if (!loaded) {
        requestAnimationFrame(loop);
        return;
      }
      // Un frame mas tras `load`, para no perder el estado final, y se cierra el registro.
      requestAnimationFrame(() => {
        capture();
        (window as unknown as { __themeFramesDone?: boolean }).__themeFramesDone = true;
      });
    };
    requestAnimationFrame(loop);
  });
}

/** Espera a que `armFrameLog` termine de registrar (hasta el frame posterior a `load`). */
async function readThemeFrames(page: Page): Promise<ThemeFrame[]> {
  await page.waitForFunction(
    () => (window as unknown as { __themeFramesDone?: boolean }).__themeFramesDone === true,
  );
  return page.evaluate(
    () => (window as unknown as { __themeFrames: ThemeFrame[] }).__themeFrames,
  );
}

/**
 * Espera de forma deterministica a que React haya hidratado la app (fibra de React presente en
 * `<body>`). Uso exclusivo del escenario R17: cambiar `page.emulateMedia` antes de que el
 * proveedor exista haria que el evento `change` se perdiera sin que nadie lo compensara.
 */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const body = document.body as unknown as Record<string, unknown>;
    return Object.keys(body).some(
      (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactContainer$'),
    );
  });
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
    // R10, R7 — sin cookie, el sistema operativo dice oscuro: ningun frame con contenido ya
    // pintado puede traer el modo claro, ni siquiera el primero (nadie tiene que ver un
    // parpadeo mientras React hidrata). Los frames sin contenido (`hasContent: false`) no
    // cuentan: si el documento todavia no tenia nada que pintar, no hubo parpadeo visible.
    await page.emulateMedia({ colorScheme: 'dark' });
    await armFrameLog(page);

    await page.goto(LOGIN_PATH);

    const frames = await readThemeFrames(page);
    const paintedFrames = frames.filter((frame) => frame.hasContent);
    expect(paintedFrames.length).toBeGreaterThan(0);
    for (const frame of paintedFrames) {
      expect(isDarkClassName(frame.className)).toBe(true);
    }
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

    // R17 dice "mientras la pestaña esta abierta": una pestaña que todavia no termino de
    // hidratar no es ese escenario. Se espera a que el proveedor exista de verdad antes de
    // cambiar la emulacion, para no perder el evento `change` contra un listener que aun no se
    // suscribio (carrera real en `next dev` compilando en frio).
    await waitForHydration(page);

    await page.emulateMedia({ colorScheme: 'dark' });

    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true);

    // Y sin haber navegado en ningun momento.
    expect(new URL(page.url()).pathname).toBe(LOGIN_PATH);
  });
});
