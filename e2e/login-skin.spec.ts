/**
 * E2E de la PIEL de la pantalla de login (QC-30, T9; nivel 3 de `design.md > 8`).
 *
 * Que aporta sobre lo que ya cubren los tests unitarios (`tests/unit/login-skin.test.tsx`):
 * un navegador de verdad, en los dos motores configurados (`playwright.config.ts` — chromium y
 * webkit, que es el de iOS). El nivel 1 lee `app/globals.css` como texto y el nivel 2 renderiza
 * el marcado en jsdom; ninguno de los dos puede afirmar el ALTO COMPUTADO de un campo, porque
 * jsdom no compila la hoja de Tailwind ni resuelve la cascada. Un `toHaveStyle('44px')` alli
 * seria teatro: el numero solo existe cuando un motor real ha aplicado las reglas.
 *
 * EL CORAZON DE LA FICHA. Los 44 px de R16 dependen de que el bloque de QC-30 este declarado
 * FUERA de toda `@layer`: en Tailwind v4 las utilidades viven en cascade layers y una regla sin
 * capa les gana. Si ese bloque hubiera caido dentro de `@layer base`, perderia contra el `h-8`
 * que traen `components/ui/input.tsx` y `components/ui/button.tsx`, y aqui saldrian 32 px. Este
 * archivo es lo unico del arnes que lo detecta de verdad.
 *
 * DATOS: NINGUNO. Este spec no crea ni borra una sola fila, no importa Prisma y no autentica:
 * navega a `/login` sin sesion y mide. `e2e/login.spec.ts` es el que ejercita el flujo critico
 * con fixtures de base de datos, y esta ficha lo deja intacto (R26, segunda mitad): colgar
 * aserciones de pixeles de aquel archivo anadiria riesgo a lo unico que no debe romperse.
 *
 * SIN SCREENSHOTS COMPARADOS. Con tres burbujas animadas de forma continua, una comparacion de
 * imagen seria intermitente por construccion, y ademas no distingue "cambio el color" de "se
 * movio un fotograma": responderia a una pregunta distinta de la que hacen los requisitos. Todo
 * se afirma con estilo computado, medidas y visibilidad, que es exactamente lo que R14, R16,
 * R22 y R23 preguntan. Cuenta ademas para WebKit, donde la capa decorativa tiene
 * `pointer-events: none` y las burbujas nunca estan quietas.
 */
import { expect, test, type Locator } from '@playwright/test';

/** Ruta publica del login (QC-10). No hay constante para ella en `lib/shared/routes.ts`. */
const LOGIN_PATH = '/login';

/** Medidas exigidas por `design-input-login.md > 3`, citadas por R16 y R23. */
const MIN_TOUCH_TARGET_PX = 44;
const MAX_CARD_WIDTH_PX = 400;
const MIN_INPUT_FONT_SIZE_PX = 16;

/** Viewports deterministas: no se confia en el default de cada `devices[...]`. */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
/** Angosto de telefono (iPhone-ish), por debajo del `sm:` de 640 px y del `md:` de 768 px. */
const PHONE_VIEWPORT = { width: 390, height: 844 };

/** Alto computado en pixeles, tal como lo resolvio el motor tras aplicar la cascada. */
async function computedHeightPx(locator: Locator): Promise<number> {
  return locator.evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).height),
  );
}

/** Tamano de letra computado en pixeles. */
async function computedFontSizePx(locator: Locator): Promise<number> {
  return locator.evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).fontSize),
  );
}

// Timeout amplio: el primer `goto` hace que `next dev` compile la ruta bajo demanda en el
// puerto propio del E2E. Un timeout corto aqui produce rojos que no son del codigo.
test.setTimeout(120_000);

test.describe('piel de la pantalla de login en navegador real', () => {
  test('presenta campos y boton con al menos 44 px de alto computado', async ({ page }) => {
    // R16, R23 — destinos tactiles. Si el bloque de QC-30 estuviera dentro de `@layer base`,
    // el `h-8` del primitivo ganaria y estas tres medidas serian 32 px.
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(LOGIN_PATH);

    const username = page.getByTestId('login-username');
    const password = page.getByTestId('login-password');
    const submit = page.getByTestId('login-submit');

    // Se espera a que el control este visible antes de medir: hasta que la hoja de estilos no
    // esta aplicada, el alto computado no significa nada.
    await expect(username).toBeVisible({ timeout: 60_000 });
    await expect(password).toBeVisible();
    await expect(submit).toBeVisible();

    expect(await computedHeightPx(username)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(await computedHeightPx(password)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(await computedHeightPx(submit)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);

    // El ancho tambien: 44 x 44 px es un area, no solo una altura.
    const submitBox = await submit.boundingBox();
    expect(submitBox, 'el boton de envio no tiene caja').not.toBeNull();
    expect(submitBox?.width ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  test('no deja crecer la tarjeta mas alla de 400 px en escritorio', async ({ page }) => {
    // R16, R22 — ancho maximo de la tarjeta con sitio de sobra en la ventana.
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(LOGIN_PATH);

    const card = page.locator('[data-slot="card"]');
    await expect(card).toBeVisible({ timeout: 60_000 });

    const cardBox = await card.boundingBox();
    expect(cardBox, 'la tarjeta del login no tiene caja').not.toBeNull();
    expect(cardBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(MAX_CARD_WIDTH_PX);
  });

  test('en viewport de telefono no provoca scroll horizontal y conserva 16 px de letra', async ({
    page,
  }) => {
    // R22, R23 — la ventana angosta es donde una tarjeta de ancho fijo desbordaria, y donde un
    // `font-size` por debajo de 16 px haria que iOS hiciera zoom al enfocar el campo.
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto(LOGIN_PATH);

    const card = page.locator('[data-slot="card"]');
    await expect(card).toBeVisible({ timeout: 60_000 });

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // La tarjeta tampoco se sale del viewport por si sola.
    const cardBox = await card.boundingBox();
    expect(cardBox, 'la tarjeta del login no tiene caja').not.toBeNull();
    expect(cardBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(PHONE_VIEWPORT.width);

    // El primitivo trae `text-base` y solo baja a `text-sm` desde `md:`, o sea nunca en un
    // telefono; el bloque de QC-30 no toca el tamano de letra. Esto lo comprueba en el motor
    // real en vez de darlo por supuesto leyendo las clases.
    const username = page.getByTestId('login-username');
    expect(await computedFontSizePx(username)).toBeGreaterThanOrEqual(MIN_INPUT_FONT_SIZE_PX);

    // Y el destino tactil sigue siendo el mismo en angosto.
    expect(await computedHeightPx(username)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  test('oculta la capa de burbujas cuando el sistema pide movimiento reducido', async ({
    page,
  }) => {
    // R14 — la emulacion se aplica ANTES de navegar, para que la media query ya este resuelta
    // en el primer calculo de estilos y no dependa de un recalculo posterior.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(LOGIN_PATH);

    // Anclaje: se espera a que la pantalla este pintada antes de afirmar que algo NO se ve; sin
    // esto, un `toBeHidden` pasaria simplemente porque la pagina aun no habia cargado.
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 60_000 });

    const bubbles = page.locator('[data-login="bubbles"]');
    await expect(bubbles).toBeHidden();
    expect(
      await bubbles.evaluate((element) => window.getComputedStyle(element).display),
    ).toBe('none');
  });

  test('pinta las tres burbujas cuando no hay preferencia de movimiento reducido', async ({
    page,
  }) => {
    // R14 (contraste) — sin este escenario, el test anterior tambien pasaria si alguien borrara
    // el componente entero: "no visible" y "no existe" se parecen demasiado. Aqui se exige que
    // la capa exista, se vea, y contenga exactamente tres burbujas (conteo local y semantico:
    // la decision cerrada 8 dice tres, ni dos ni cuatro).
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(LOGIN_PATH);

    const bubbles = page.locator('[data-login="bubbles"]');
    await expect(bubbles).toBeVisible({ timeout: 60_000 });
    expect(
      await bubbles.evaluate((element) => window.getComputedStyle(element).display),
    ).not.toBe('none');

    // Se cuenta, no se compara un screenshot: las burbujas estan animadas y tienen
    // `pointer-events: none`, asi que cualquier aserto basado en imagen o en interaccion seria
    // intermitente en WebKit.
    await expect(page.locator('[data-login="bubble"]')).toHaveCount(3);
  });
});
