/**
 * E2E del movimiento de la interfaz: duraciones y curvas CALCULADAS por un navegador real.
 *
 * Que aporta sobre los unitarios (`motion-classes.test.tsx`, `motion-tokens.test.ts`,
 * `sidebar-active-indicator.test.tsx`, `screen-enter.test.tsx`): jsdom no compila Tailwind ni
 * resuelve la cascada, asi que no puede decir que duracion gana de verdad. Aqui se lee
 * `getComputedStyle`:
 *  - de un dialogo (`Dialog` de subida de PDF de formulas), un panel lateral (`Sheet` de alta de
 *    cliente) y un toast de Sonner, en el instante en que entran y en el que salen;
 *  - del toast en concreto, para demostrar que las reglas de `app/globals.css` ganan a la hoja que
 *    Sonner inyecta en tiempo de ejecucion (la suya da 400 ms y `ease`);
 *  - del indicador del item activo, que tiene que acabar encima del item activo con la barra
 *    expandida y en modo icono;
 *  - de la entrada de pantalla (`data-screen-enter`), que aparece al cambiar de modulo y no al
 *    cambiar de pestana dentro del mismo modulo.
 * Todo se repite con `page.emulateMedia({ reducedMotion: 'reduce' })`.
 *
 * LA SONDA: `page.addInitScript` instala, antes de que corra la pagina, un `MutationObserver` sobre
 * el documento. Al montarse abierta o recibir `data-open` (apertura) y al recibir su atributo de
 * salida (`data-closed`, `data-ending-style` o `data-removed="true"`) guarda su estilo calculado. Leerlo despues con un
 * `evaluate` llegaria tarde: la salida dura 150 ms y la pieza se desmonta al terminar.
 *
 * DATOS: una EMPRESA, un Administrador del seed y un cliente por worker, con el prefijo
 * `qc228_e2e_` y el `RUN_ID` del proceso. El cliente sembrado da filas a la lista de clientes, sin
 * las que no hay caja de busqueda (la navegacion dentro del modulo de R20). Ademas el recorrido da de
 * alta un cliente por la interfaz: un panel y un toast reales necesitan una accion real. El dialogo
 * es el de subida de PDF del listado de formulas, que no escribe nada al abrirse y cerrarse. No vale
 * el de baja de cliente: su fila lo monta solo mientras esta abierto, y al cerrarlo se desmonta sin
 * salida que medir. El `afterAll` borra por la empresa exacta del worker; la limpieza defensiva, por
 * prefijo y edad.
 *
 * ENTRADA: siempre por `loginAndLand`, que deriva el aterrizaje de los permisos reales. Despues se
 * navega por URL a «Clientes», hermano de «Proveedores» en la misma lista del menu.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { normalizeCustomerText } from '@/lib/modules/clientes';
import { DOCUMENT_TYPE_CC, ROLE_ADMINISTRADOR, normalizeCompanyName } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import { CUSTOMERS_ROUTE, FORMULAS_ROUTE, SUPPLIERS_ROUTE } from '@/lib/shared/routes';

import { createFixtureUser } from './helpers/fixture-user';
import { loginAndLand } from './helpers/landing';

/** Prefijo con el que este spec marca TODO lo que crea. Nada fuera de el se toca. */
const FIXTURE_PREFIX = 'qc228_e2e_';

/** Identificador unico de este proceso de worker. */
const RUN_ID = randomUUID().replace(/-/g, '');

/** Edad minima de un resto de otra ejecucion: el otro proyecto corre a la vez con sus filas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Viewport de escritorio: la barra lateral es fija (no un `Sheet`) y la pastilla de colapso existe. */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

/** Tokens de `app/globals.css`, en milisegundos y como los serializa el motor. */
const DUR_FAST_MS = 150;
const DUR_BASE_MS = 200;
const DUR_SLOW_MS = 300;
const MAX_DURATION_MS = 400;
/** La regla global de movimiento reducido deja cada duracion en 0.01 ms. */
const REDUCED_DURATION_MS = 0.01;
const EASE_STANDARD = 'cubic-bezier(0.2,0,0,1)';
const EASE_ENTER = 'cubic-bezier(0,0,0.2,1)';
const EASE_EXIT = 'cubic-bezier(0.4,0,1,1)';
/** Retardo del segundo bloque de la entrada de pantalla. */
const SECOND_BLOCK_DELAY_MS = 40;
/** Lo que vive el atributo de entrada (`SCREEN_ENTER_MS`), con margen. */
const SCREEN_ENTER_SETTLE_MS = 700;

/** `data-testid` de las pantallas (constantes locales: sus modulos son de cliente). */
const CUSTOMERS_TITLE_TESTID = 'clientes-title';
const CUSTOMER_CREATE_OPEN_TESTID = 'customer-create-open';
const CUSTOMER_SHEET_TESTID = 'customer-sheet';
const CUSTOMER_SUBMIT_TESTID = 'customer-form-submit';
const CUSTOMER_FIRST_NAMES_TESTID = 'customer-field-first-names';
const CUSTOMER_LAST_NAMES_TESTID = 'customer-field-last-names';
const CUSTOMER_CITY_TESTID = 'customer-field-city';
const RECIPES_TITLE_TESTID = 'recipes-title';
const UPLOAD_OPEN_TESTID = 'document-upload-open';
const UPLOAD_DIALOG_TESTID = 'document-upload-dialog';
const UPLOAD_CLOSE_TESTID = 'document-upload-close';
const SEARCH_BOX_TESTID = 'data-table-search';
const SEARCH_PARAM = 'q';
const NAV_CUSTOMERS_TESTID = 'nav-clientes';
const NAV_SUPPLIERS_TESTID = 'nav-proveedores';
const SUPPLIERS_TITLE_TESTID = 'proveedores-title';
const SIDEBAR_EDGE_TOGGLE_TESTID = 'private-sidebar-edge-toggle';

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc228-Admin-${RUN_ID.slice(0, 12)}`,
};

const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;
let companyId: string | null = null;

/** El cliente sembrado: da filas a la lista para que exista la caja de busqueda. */
const seededCustomer = {
  firstNames: `Qc228${RUN_ID.slice(0, 8)}`,
  lastNames: `Sembrado${RUN_ID}`,
  city: `${FIXTURE_PREFIX}ciudad_${RUN_ID}`,
} as const;

type MotionRecord = {
  readonly target: string;
  readonly phase: 'open' | 'close';
  readonly animationName: string;
  readonly animationDuration: string;
  readonly animationTimingFunction: string;
  readonly animationIterationCount: string;
  readonly transitionDuration: string;
  readonly transitionTimingFunction: string;
};

type BlockStyle = {
  readonly animationName: string;
  readonly animationDuration: string;
  readonly animationTimingFunction: string;
  readonly animationDelay: string;
};

type ScreenEnterRecord = { readonly pathname: string; readonly blocks: readonly BlockStyle[] };

type ProbeWindow = Window & {
  __motion: MotionRecord[];
  __screenEnter: ScreenEnterRecord[];
  __slides: { transitionDuration: string; transitionTimingFunction: string }[];
};

/**
 * La sonda. Corre en el navegador ANTES que la pagina (ver cabecera); por eso no usa nada de fuera
 * de su cuerpo.
 */
function installMotionProbe(): void {
  const w = window as unknown as ProbeWindow;
  w.__motion = [];
  w.__screenEnter = [];

  const tracked = [
    '[data-slot="dialog-content"]',
    '[data-slot="dialog-overlay"]',
    '[data-slot="alert-dialog-content"]',
    '[data-slot="alert-dialog-overlay"]',
    '[data-slot="sheet-content"]',
    '[data-slot="sheet-overlay"]',
    '[data-sonner-toast]',
  ].join(',');
  const seen = new WeakMap<Element, Set<string>>();

  const isClosing = (el: Element): boolean =>
    el.hasAttribute('data-closed') ||
    el.hasAttribute('data-ending-style') ||
    el.getAttribute('data-removed') === 'true';

  const record = (el: Element, phase: 'open' | 'close'): void => {
    const phases = seen.get(el) ?? new Set<string>();
    // Un dialogo con `keepMounted` vuelve a abrirse sobre el mismo elemento.
    if (phase === 'open') phases.delete('close');
    if (phases.has(phase)) return;
    phases.add(phase);
    seen.set(el, phases);
    const s = getComputedStyle(el);
    w.__motion.push({
      target: el.getAttribute('data-slot') ?? 'toast',
      phase,
      animationName: s.animationName,
      animationDuration: s.animationDuration,
      animationTimingFunction: s.animationTimingFunction,
      animationIterationCount: s.animationIterationCount,
      transitionDuration: s.transitionDuration,
      transitionTimingFunction: s.transitionTimingFunction,
    });
  };

  const screen = (el: Element): void => {
    if (!el.hasAttribute('data-screen-enter')) return;
    const root = el.firstElementChild;
    const blocks = root
      ? Array.from(root.children)
          .slice(0, 2)
          .map((block) => {
            const s = getComputedStyle(block);
            return {
              animationName: s.animationName,
              animationDuration: s.animationDuration,
              animationTimingFunction: s.animationTimingFunction,
              animationDelay: s.animationDelay,
            };
          })
      : [];
    w.__screenEnter.push({ pathname: location.pathname, blocks });
  };

  const visit = (node: Node): void => {
    if (!(node instanceof Element)) return;
    for (const el of [node, ...Array.from(node.querySelectorAll('*'))]) {
      // Montado ya cerrado (`keepMounted`): no es ni una apertura ni una salida.
      if (el.matches(tracked) && !isClosing(el)) record(el, 'open');
      if (el.hasAttribute('data-screen-enter')) screen(el);
    }
  };

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(visit);
        continue;
      }
      const el = mutation.target;
      if (!(el instanceof Element)) continue;
      if (mutation.attributeName === 'data-screen-enter') screen(el);
      else if (el.matches(tracked)) {
        if (isClosing(el)) record(el, 'close');
        else if (el.hasAttribute('data-open')) record(el, 'open');
      }
    }
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'data-open',
      'data-closed',
      'data-ending-style',
      'data-removed',
      'data-screen-enter',
    ],
  });
}

/** `"0.3s, 200ms"` -> `[300, 200]`. Admite la notacion exponencial (`1e-05s`). */
function durationsMs(value: string): number[] {
  return value.split(',').map((part) => {
    const trimmed = part.trim();
    const amount = Number.parseFloat(trimmed);
    return trimmed.endsWith('ms') ? amount : amount * 1000;
  });
}

function curve(value: string): string {
  return value.replace(/\s+/g, '');
}

/** Cada duracion es exactamente la esperada (con tolerancia de redondeo). */
function expectDurations(value: string, expectedMs: number, what: string): void {
  for (const ms of durationsMs(value)) {
    expect(ms, `${what}: ${value}`).toBeCloseTo(expectedMs, 3);
  }
}

/** Con movimiento reducido toda duracion queda en 0.01 ms o menos. */
function expectReduced(value: string, what: string): void {
  for (const ms of durationsMs(value)) {
    expect(ms, `${what}: ${value}`).toBeLessThanOrEqual(REDUCED_DURATION_MS + 1e-6);
  }
}

async function motionRecords(page: Page): Promise<MotionRecord[]> {
  return page.evaluate(() => (window as unknown as ProbeWindow).__motion);
}

async function waitForRecord(
  page: Page,
  target: string,
  phase: 'open' | 'close',
  timeout = 60_000,
): Promise<MotionRecord> {
  await expect
    .poll(
      async () => (await motionRecords(page)).some((r) => r.target === target && r.phase === phase),
      { message: `la sonda no vio ${target} (${phase})`, timeout },
    )
    .toBe(true);
  const records = await motionRecords(page);
  return records.filter((r) => r.target === target && r.phase === phase).at(-1) as MotionRecord;
}

/** Posicion relativa del indicador frente al boton activo de su misma lista. */
async function indicatorFit(page: Page, testId: string) {
  return page.evaluate((id) => {
    const button = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const list = button?.closest('[data-slot="sidebar-menu"]');
    const container = list?.parentElement;
    const indicator = container?.querySelector<HTMLElement>(
      ':scope > [data-slot="sidebar-active-indicator"]',
    );
    if (!button || !container || !indicator) return null;
    const a = button.getBoundingClientRect();
    const b = indicator.getBoundingClientRect();
    return {
      active: button.hasAttribute('data-active'),
      ready: container.hasAttribute('data-indicator-ready'),
      opacity: getComputedStyle(indicator).opacity,
      maxDelta: Math.max(
        Math.abs(a.left - b.left),
        Math.abs(a.top - b.top),
        Math.abs(a.width - b.width),
        Math.abs(a.height - b.height),
      ),
    };
  }, testId);
}

async function expectIndicatorOver(page: Page, testId: string, what: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const fit = await indicatorFit(page, testId);
        return (
          fit !== null && fit.active && fit.ready && fit.opacity === '1' && fit.maxDelta < 1
        );
      },
      { message: `el indicador no quedo sobre ${testId} (${what})`, timeout: 15_000 },
    )
    .toBe(true);
}

/** Sigue al indicador de la lista de `testId` y guarda su estilo cada vez que pasa a deslizarse. */
async function watchSlide(page: Page, testId: string): Promise<void> {
  await page.evaluate((id) => {
    const w = window as unknown as ProbeWindow;
    w.__slides = [];
    const button = document.querySelector(`[data-testid="${id}"]`);
    const indicator = button
      ?.closest('[data-slot="sidebar-menu"]')
      ?.parentElement?.querySelector<HTMLElement>(':scope > [data-slot="sidebar-active-indicator"]');
    if (!indicator) throw new Error(`no hay indicador en la lista de ${id}`);
    new MutationObserver(() => {
      if (indicator.dataset.motion !== 'slide') return;
      const s = getComputedStyle(indicator);
      w.__slides.push({
        transitionDuration: s.transitionDuration,
        transitionTimingFunction: s.transitionTimingFunction,
      });
    }).observe(indicator, { attributes: true, attributeFilter: ['data-motion'] });
  }, testId);
}

/** Entra con movimiento normal o reducido, con la sonda armada y la app ya hidratada. */
async function enter(page: Page, reduced: boolean): Promise<void> {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript(installMotionProbe);
  await loginAndLand(page, adminUser);
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'la emulacion de movimiento reducido no llego a la pagina',
  ).toBe(reduced);
  // El indicador marca su contenedor en un efecto de cliente: es la senal de que hidrato.
  await expect(page.locator('[data-indicator-ready]').first()).toBeAttached({ timeout: 60_000 });
}

/** Abre «Clientes» por URL y espera a que hidrate (el indicador de su lista ya esta colocado). */
async function openCustomers(page: Page): Promise<void> {
  await page.goto(CUSTOMERS_ROUTE);
  await expect(page.getByTestId(CUSTOMERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-indicator-ready]').first()).toBeAttached({ timeout: 60_000 });
}

/**
 * Escribe en la caja de busqueda y espera a que la URL lleve el termino. Se reintenta porque lo
 * escrito antes de hidratar no emite la busqueda (mismo patron que `e2e/clientes.spec.ts`).
 */
async function searchFor(page: Page, term: string): Promise<void> {
  const searchBox = page.getByTestId(SEARCH_BOX_TESTID);
  await expect(async () => {
    await searchBox.fill('');
    await searchBox.fill(term);
    await expect(page).toHaveURL((url) => url.searchParams.get(SEARCH_PARAM) === term, {
      timeout: 15_000,
    });
  }).toPass({ timeout: 120_000 });
}

test.beforeAll(async () => {
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphans = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanIds = orphans.map((c) => c.id);
  if (orphanIds.length > 0) {
    await prisma.customer.deleteMany({ where: { companyId: { in: orphanIds } } });
    await prisma.user.deleteMany({ where: { companyId: { in: orphanIds } } });
    await prisma.company.deleteMany({ where: { id: { in: orphanIds } } });
  }

  companyId = (
    await prisma.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
  ).id;

  const role = await prisma.role.findUnique({
    where: { name: ROLE_ADMINISTRADOR },
    select: { id: true },
  });
  if (!role) {
    throw new Error(`falta el rol "${ROLE_ADMINISTRADOR}": siembra la base con \`pnpm run db:seed\``);
  }
  await createFixtureUser({
    data: {
      firstNames: `Qc228${RUN_ID.slice(0, 8)}`,
      lastNames: 'Movimiento',
      birthDate: new Date('1990-01-01'),
      email: `${adminUser.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: adminUser.username,
      username: adminUser.username,
      passwordHash: await createPasswordHash(adminUser.password),
      roleId: role.id,
      companyId,
      // Una cuenta `pending` (el valor por defecto) no entra por el login.
      accountStatus: 'active',
    },
    select: { id: true },
  });

  await prisma.customer.create({
    data: {
      ...seededCustomer,
      firstNamesNormalized: normalizeCustomerText(seededCustomer.firstNames),
      lastNamesNormalized: normalizeCustomerText(seededCustomer.lastNames),
      cityNormalized: normalizeCustomerText(seededCustomer.city),
      companyId,
    },
    select: { id: true },
  });
});

test.afterAll(async () => {
  // Orden de la FK restrictiva: clientes -> usuarios -> empresa, solo de ESTE worker.
  try {
    if (companyId) {
      await prisma.customer.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
    }
  } finally {
    try {
      await prisma.company.deleteMany({ where: { name: companyName } });
    } finally {
      await prisma.$disconnect();
    }
  }
});

// `next dev` compila cada ruta bajo demanda y bcrypt tarda a proposito.
test.setTimeout(180_000);

for (const reduced of [false, true]) {
  const mode = reduced ? 'con movimiento reducido' : 'con movimiento normal';

  test.describe(`movimiento de la interfaz ${mode}`, () => {
    test(`R4, R5, R6, R10, R21: panel lateral, toast y dialogo entran y salen con sus tokens ${mode}`, async ({
      page,
    }) => {
      await enter(page, reduced);
      await openCustomers(page);

      // --- Panel lateral: se abre con el alta. En WebKit un clic antes de hidratar se pierde.
      const sheet = page.getByTestId(CUSTOMER_SHEET_TESTID);
      await expect(async () => {
        if ((await sheet.count()) === 0) {
          await page.getByTestId(CUSTOMER_CREATE_OPEN_TESTID).first().click();
        }
        await expect(sheet).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 60_000 });

      const sheetIn = await waitForRecord(page, 'sheet-content', 'open');
      const sheetOverlayIn = await waitForRecord(page, 'sheet-overlay', 'open');

      const suffix = reduced ? 'r' : 'n';
      const lastNames = `Movimiento${suffix}${RUN_ID}`;
      await page.getByTestId(CUSTOMER_FIRST_NAMES_TESTID).fill(`Qc228${RUN_ID.slice(0, 8)}`);
      await page.getByTestId(CUSTOMER_LAST_NAMES_TESTID).fill(lastNames);
      await page.getByTestId(CUSTOMER_CITY_TESTID).fill(`${FIXTURE_PREFIX}ciudad_${RUN_ID}`);
      await page.getByTestId(CUSTOMER_SUBMIT_TESTID).click();

      // --- Con exito el panel se cierra y sale un toast.
      await expect(sheet).toHaveCount(0, { timeout: 60_000 });
      const sheetOut = await waitForRecord(page, 'sheet-content', 'close');
      const sheetOverlayOut = await waitForRecord(page, 'sheet-overlay', 'close');
      const toastIn = await waitForRecord(page, 'toast', 'open');
      // El toast vence solo (Sonner, 4 s por defecto) y su salida queda registrada. Con el puntero
      // encima Sonner pausa el plazo, y el clic de guardar lo dejo en la esquina del toast.
      await page.mouse.move(1, 1);
      const toastOut = await waitForRecord(page, 'toast', 'close', 30_000);
      // Antes de salir de la pagina: la sonda se rearma vacia en cada carga.
      const toastRecords = (await motionRecords(page)).filter((r) => r.target === 'toast');

      // --- Dialogo: el de subida de PDF del listado de formulas, abierto y cerrado.
      await page.goto(FORMULAS_ROUTE);
      await expect(page.getByTestId(RECIPES_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
      const dialog = page.getByTestId(UPLOAD_DIALOG_TESTID);
      await expect(async () => {
        if (!(await dialog.isVisible())) await page.getByTestId(UPLOAD_OPEN_TESTID).click();
        await expect(dialog).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 60_000 });
      const dialogIn = await waitForRecord(page, 'dialog-content', 'open');
      const dialogOverlayIn = await waitForRecord(page, 'dialog-overlay', 'open');

      await page.getByTestId(UPLOAD_CLOSE_TESTID).click();
      await expect(dialog).toBeHidden({ timeout: 60_000 });
      const dialogOut = await waitForRecord(page, 'dialog-content', 'close');
      const dialogOverlayOut = await waitForRecord(page, 'dialog-overlay', 'close');

      if (reduced) {
        // R21: sin desplazamientos ni escalados porque toda duracion queda en 0.01 ms.
        expectReduced(sheetIn.transitionDuration, 'panel al entrar');
        expectReduced(sheetOverlayIn.transitionDuration, 'velo del panel al entrar');
        expectReduced(sheetOut.transitionDuration, 'panel al salir');
        expectReduced(sheetOverlayOut.transitionDuration, 'velo del panel al salir');
        for (const [r, what] of [
          [dialogIn, 'dialogo al entrar'],
          [dialogOverlayIn, 'velo del dialogo al entrar'],
          [dialogOut, 'dialogo al salir'],
          [dialogOverlayOut, 'velo del dialogo al salir'],
        ] as const) {
          expectReduced(r.animationDuration, what);
          expect(r.animationIterationCount, what).toBe('1');
        }
        expectReduced(toastIn.transitionDuration, 'toast al entrar');
        expectReduced(toastOut.transitionDuration, 'toast al salir');
        return;
      }

      // R6: el panel entra en --dur-slow con --ease-enter y sale en --dur-fast con --ease-exit;
      // su velo, como el del dialogo (R4, R5).
      expectDurations(sheetIn.transitionDuration, DUR_SLOW_MS, 'panel al entrar');
      expect(curve(sheetIn.transitionTimingFunction)).toBe(EASE_ENTER);
      expectDurations(sheetOverlayIn.transitionDuration, DUR_BASE_MS, 'velo del panel al entrar');
      expectDurations(sheetOut.transitionDuration, DUR_FAST_MS, 'panel al salir');
      expect(curve(sheetOut.transitionTimingFunction)).toBe(EASE_EXIT);
      expectDurations(sheetOverlayOut.transitionDuration, DUR_FAST_MS, 'velo del panel al salir');
      expect(curve(sheetOverlayOut.transitionTimingFunction)).toBe(EASE_EXIT);

      // R4: el dialogo entra con fundido y escala en --dur-slow con --ease-enter; su velo, en
      // --dur-base.
      expect(dialogIn.animationName).toBe('enter');
      expectDurations(dialogIn.animationDuration, DUR_SLOW_MS, 'dialogo al entrar');
      expect(curve(dialogIn.animationTimingFunction)).toBe(EASE_ENTER);
      expect(dialogOverlayIn.animationName).toBe('enter');
      expectDurations(dialogOverlayIn.animationDuration, DUR_BASE_MS, 'velo del dialogo al entrar');

      // R5: dialogo y velo salen en --dur-fast con --ease-exit.
      for (const [r, what] of [
        [dialogOut, 'dialogo al salir'],
        [dialogOverlayOut, 'velo del dialogo al salir'],
      ] as const) {
        expect(r.animationName, what).toBe('exit');
        expectDurations(r.animationDuration, DUR_FAST_MS, what);
        expect(curve(r.animationTimingFunction), what).toBe(EASE_EXIT);
      }

      // R10: el toast entra en --dur-slow (sombra en --dur-base) con --ease-enter y sale en
      // --dur-fast con --ease-exit. Si ganara la hoja de Sonner se leerian 400 ms y `ease`.
      expect(durationsMs(toastIn.transitionDuration)).toEqual([
        DUR_SLOW_MS,
        DUR_SLOW_MS,
        DUR_SLOW_MS,
        DUR_BASE_MS,
      ]);
      expect(curve(toastIn.transitionTimingFunction)).toBe(EASE_ENTER);
      expectDurations(toastOut.transitionDuration, DUR_FAST_MS, 'toast al salir');
      expect(curve(toastOut.transitionTimingFunction)).toBe(EASE_EXIT);
      for (const toast of toastRecords) {
        for (const ms of durationsMs(toast.transitionDuration)) {
          expect(ms, `ninguna transicion del toast supera ${MAX_DURATION_MS} ms`).toBeLessThanOrEqual(
            MAX_DURATION_MS,
          );
        }
      }
    });

    test(`R13, R15, R19, R20, R21: indicador del item activo y entrada de pantalla ${mode}`, async ({
      page,
    }) => {
      await enter(page, reduced);
      await openCustomers(page);

      // R15: con la barra expandida, el indicador cubre el item activo de la carga inicial.
      await expectIndicatorOver(page, NAV_CUSTOMERS_TESTID, 'expandida, carga inicial');

      // La entrada de la carga inicial termina y el atributo se va.
      await expect(page.locator('[data-screen-enter]')).toHaveCount(0, { timeout: 10_000 });

      // --- R20: buscar dentro del modulo cambia la URL pero no repite la entrada.
      await page.evaluate(() => {
        (window as unknown as ProbeWindow).__screenEnter = [];
      });
      await searchFor(page, normalizeCustomerText(seededCustomer.lastNames));
      await page.waitForTimeout(SCREEN_ENTER_SETTLE_MS);
      expect(
        await page.evaluate(() => (window as unknown as ProbeWindow).__screenEnter),
        'navegar dentro del modulo no debe repetir la entrada de pantalla',
      ).toEqual([]);
      await expect(page.locator('[data-screen-enter]')).toHaveCount(0);

      // --- R13 y R19: pasar a otro modulo de la MISMA lista desliza el indicador y repite la
      // entrada de pantalla.
      await watchSlide(page, NAV_SUPPLIERS_TESTID);
      await page.getByTestId(NAV_SUPPLIERS_TESTID).click();
      await page.waitForURL((url) => url.pathname === SUPPLIERS_ROUTE, { timeout: 60_000 });
      await expect(page.getByTestId(SUPPLIERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });

      await expect
        .poll(
          async () =>
            (
              await page.evaluate(() => (window as unknown as ProbeWindow).__screenEnter)
            ).some((r) => r.pathname === SUPPLIERS_ROUTE),
          { message: 'cambiar de modulo debe poner data-screen-enter', timeout: 15_000 },
        )
        .toBe(true);
      const screen = (
        await page.evaluate(() => (window as unknown as ProbeWindow).__screenEnter)
      ).find((r) => r.pathname === SUPPLIERS_ROUTE) as ScreenEnterRecord;
      expect(screen.blocks.length, 'la pantalla nueva no trae bloques').toBeGreaterThanOrEqual(2);
      const [first, second] = screen.blocks as [BlockStyle, BlockStyle];
      expect(first.animationName).toBe('screen-enter');
      expect(second.animationName).toBe('screen-enter');

      await expectIndicatorOver(page, NAV_SUPPLIERS_TESTID, 'expandida, tras cambiar de modulo');
      const slides = await page.evaluate(() => (window as unknown as ProbeWindow).__slides);
      expect(slides.length, 'el indicador debe deslizarse dentro de la misma lista').toBeGreaterThan(0);
      const slide = slides[0] as ProbeWindow['__slides'][number];

      if (reduced) {
        // R21: la entrada y el deslizamiento quedan en 0.01 ms y los bloques sin retardo.
        expectReduced(first.animationDuration, 'entrada de pantalla');
        expect(durationsMs(second.animationDelay)).toEqual([0]);
        expectReduced(slide.transitionDuration, 'deslizamiento del indicador');
      } else {
        // R19: --dur-slow con --ease-enter, el segundo bloque 40 ms despues.
        expectDurations(first.animationDuration, DUR_SLOW_MS, 'entrada de pantalla');
        expect(curve(first.animationTimingFunction)).toBe(EASE_ENTER);
        expect(durationsMs(first.animationDelay)).toEqual([0]);
        expect(durationsMs(second.animationDelay)[0]).toBeCloseTo(SECOND_BLOCK_DELAY_MS, 3);
        // R13: --dur-base con --ease-standard.
        expectDurations(slide.transitionDuration, DUR_BASE_MS, 'deslizamiento del indicador');
        expect(curve(slide.transitionTimingFunction)).toBe(EASE_STANDARD);
      }

      // El atributo se retira al terminar la entrada.
      await expect(page.locator('[data-screen-enter]')).toHaveCount(0, { timeout: 10_000 });

      // --- R15: en modo icono el indicador sigue sobre el item activo.
      await page.getByTestId(SIDEBAR_EDGE_TOGGLE_TESTID).click();
      await expect(page.locator('[data-slot="sidebar"][data-state="collapsed"]')).toHaveCount(1, {
        timeout: 15_000,
      });
      await expectIndicatorOver(page, NAV_SUPPLIERS_TESTID, 'modo icono');

      // Y al volver a expandir, tambien.
      await page.getByTestId(SIDEBAR_EDGE_TOGGLE_TESTID).click();
      await expect(page.locator('[data-slot="sidebar"][data-state="expanded"]')).toHaveCount(1, {
        timeout: 15_000,
      });
      await expectIndicatorOver(page, NAV_SUPPLIERS_TESTID, 'expandida de nuevo');
    });
  });
}
