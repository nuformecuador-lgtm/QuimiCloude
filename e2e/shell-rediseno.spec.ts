/**
 * E2E del shell del rediseño: giros, tooltips e idioma medidos en un navegador real.
 *
 * jsdom no corre transiciones ni posiciona flotantes, así que lo que aquí se afirma solo lo puede
 * medir un motor de verdad: que la flecha del control de la barra GIRA (hay un `transitionrun` de
 * `rotate` sobre el mismo nodo, con la duración y la curva de los tokens), que al cargar NO gira
 * sola, que los tooltips de la cabecera caen debajo de su botón y dentro de la ventana de un
 * teléfono, y que sol y luna terminan cruzados.
 *
 * DATOS: una empresa y un Administrador por worker, con el prefijo `qc257_e2e_` y el `RUN_ID` del
 * proceso. Se entra una vez por worker por el login real (`loginAndLand`) y cada caso reutiliza esa
 * sesión en un contexto nuevo con sus cookies de tema y de barra. El `afterAll` borra por la empresa
 * exacta del worker; la limpieza defensiva, por prefijo y edad.
 *
 * MOVIMIENTO: por defecto el contexto NO pide movimiento reducido, porque los casos miden la
 * transición. Solo R19 lo pide.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { DOCUMENT_TYPE_CC, ROLE_ADMINISTRADOR, normalizeCompanyName } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import { LOGIN_ROUTE } from '@/lib/shared/routes';
import { readSidebarOpenState, SIDEBAR_STATE_COOKIE } from '@/lib/shared/ui/sidebar-state';
import { THEME_COOKIE, THEME_DARK_CLASS } from '@/lib/shared/ui/theme-state';

import { createFixtureUser } from './helpers/fixture-user';
import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc257_e2e_';
const RUN_ID = randomUUID().replace(/-/g, '');
/** Edad mínima de un resto de otra ejecución: el otro proyecto corre a la vez con sus filas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
/** Teléfono de 390 px: la barra es un `Sheet` y solo se ve el control de la cabecera. */
const NARROW_VIEWPORT = { width: 390, height: 844 };

const TOLERANCE_PX = 1;
/** Tope de una transición con movimiento reducido: la regla global la deja en 0,01 ms. */
const REDUCED_MAX_SECONDS = 0.001;
/** Ventana tras hidratar en la que se vigila que la flecha no gire sola: más del doble de `--dur-base`. */
const QUIET_WINDOW_MS = 600;
const MAX_TABS = 80;

/** `data-testid` de cliente (sus módulos son de cliente y no se importan aquí). */
const EDGE_TOGGLE_TESTID = 'private-sidebar-edge-toggle';
const HEADER_TOGGLE_TESTID = 'private-sidebar-toggle';
const THEME_TOGGLE_TESTID = 'theme-toggle-trigger';
const LOGOUT_TESTID = 'private-logout';
const TOOLTIP_SELECTOR = '[data-slot="tooltip-content"]';

/** Textos que fija el requisito; el caso exige además que coincidan con el nombre accesible. */
const THEME_TOGGLE_TEXT = 'Cambiar tema';
const LOGOUT_TEXT = 'Cerrar sesión';

const CHEVRON_CLASS = 'lucide-chevron-left';
const SUN_SELECTOR = `[data-testid="${THEME_TOGGLE_TESTID}"] svg.lucide-sun`;
const MOON_SELECTOR = `[data-testid="${THEME_TOGGLE_TESTID}"] svg.lucide-moon`;
const EDGE_ARROW = `[data-testid="${EDGE_TOGGLE_TESTID}"] svg`;
const HEADER_ARROW = `[data-testid="${HEADER_TOGGLE_TESTID}"] svg`;

type Theme = 'light' | 'dark';
type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc257-Admin-${RUN_ID.slice(0, 12)}`,
};

const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;
let companyId: string | null = null;

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
let session: { state: StorageState; activeRoute: string } | null = null;

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

function log(line: string): void {
  console.log(`[medida] ${test.info().project.name} ${line}`);
}

// --- Sesión y entrada ---

async function ensureSession(browser: Browser, baseURL: string) {
  if (session) return session;
  const context = await browser.newContext({ baseURL, viewport: DESKTOP_VIEWPORT });
  const page = await context.newPage();
  const activeRoute = await loginAndLand(page, adminUser);
  const state = await context.storageState();
  await context.close();
  session = { state, activeRoute };
  return session;
}

type EnterOptions = {
  readonly theme?: Theme;
  readonly collapsed?: boolean;
  readonly viewport?: { width: number; height: number };
  readonly reducedMotion?: 'reduce' | 'no-preference';
  /** Script que corre en `document_start`, antes que cualquier script de la página. */
  readonly initScript?: () => void;
};

async function enter(
  browser: Browser,
  baseURL: string,
  {
    theme = 'light',
    collapsed = false,
    viewport = DESKTOP_VIEWPORT,
    reducedMotion = 'no-preference',
    initScript,
  }: EnterOptions = {},
): Promise<{ context: BrowserContext; page: Page; activeRoute: string }> {
  const { state, activeRoute } = await ensureSession(browser, baseURL);
  const sidebarValue = String(!collapsed);
  expect(readSidebarOpenState(sidebarValue), 'la cookie de barra no da el estado pedido').toBe(
    !collapsed,
  );

  const context = await browser.newContext({ baseURL, viewport, storageState: state, reducedMotion });
  const { hostname } = new URL(baseURL);
  await context.addCookies([
    { name: THEME_COOKIE, value: theme, domain: hostname, path: '/' },
    { name: SIDEBAR_STATE_COOKIE, value: sidebarValue, domain: hostname, path: '/' },
  ]);
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  await page.goto(activeRoute);
  await expect(page).toHaveURL((url) => url.pathname === activeRoute, { timeout: 60_000 });
  return { context, page, activeRoute };
}

/** En escritorio, hidratado: el indicador de la lista ya midió. */
async function settleDesktop(page: Page): Promise<void> {
  await expect(page.locator('[data-indicator-ready]').first()).toBeAttached({ timeout: 60_000 });
}

/**
 * En teléfono, hidratado: hasta que `useIsMobile` corre, el primitivo cree que es escritorio y el
 * control declara el estado de escritorio (expandido, por la cookie).
 */
async function settleNarrow(page: Page): Promise<void> {
  await expect(page.getByTestId(HEADER_TOGGLE_TESTID)).toHaveAttribute('aria-expanded', 'false', {
    timeout: 60_000,
  });
}

// --- Transiciones ---

/**
 * Empieza a vigilar un nodo: lo guarda por referencia y anota cada `transitionrun` que nace en él
 * (no en sus hijos). Así se puede afirmar después que es el MISMO nodo y que hubo transición.
 */
async function watch(page: Page, key: string, selector: string): Promise<void> {
  await page.evaluate(
    ({ k, sel }) => {
      const node = document.querySelector(sel);
      if (!node) throw new Error(`sin nodo: ${sel}`);
      const w = window as unknown as { __qc257?: Record<string, { node: Element; runs: string[] }> };
      w.__qc257 ??= {};
      const entry = { node, runs: [] as string[] };
      w.__qc257[k] = entry;
      node.addEventListener('transitionrun', (event) => {
        if (event.target === node) entry.runs.push((event as TransitionEvent).propertyName);
      });
    },
    { k: key, sel: selector },
  );
}

async function runsOf(page: Page, key: string): Promise<string[]> {
  return page.evaluate(
    (k) =>
      (window as unknown as { __qc257: Record<string, { runs: string[] }> }).__qc257[k].runs.slice(),
    key,
  );
}

type Settled = {
  sameNode: boolean;
  className: string;
  rotate: string;
  scale: string;
  opacity: string;
  /** Duración (s) y curva de cada propiedad declarada en `transition-property`. */
  transitions: Record<string, { duration: number; timing: string }>;
  token: { duration: number; timing: string };
};

/** Espera a que acaben las transiciones del nodo vigilado y lee su estado calculado. */
async function settled(page: Page, key: string, selector: string): Promise<Settled> {
  return page.evaluate(
    async ({ k, sel }) => {
      const { node } = (window as unknown as { __qc257: Record<string, { node: Element }> }).__qc257[k];
      // Leer el estilo antes fuerza el recálculo que arranca una transición pendiente.
      void getComputedStyle(node).rotate;
      await Promise.all(node.getAnimations().map((a) => a.finished.catch(() => undefined)));
      const s = getComputedStyle(node);
      const split = (v: string) => v.split(/,(?![^(]*\))/).map((p) => p.trim());
      const props = split(s.transitionProperty);
      const durations = split(s.transitionDuration);
      const timings = split(s.transitionTimingFunction);
      const transitions: Record<string, { duration: number; timing: string }> = {};
      props.forEach((p, i) => {
        transitions[p] = {
          duration: parseFloat(durations[i % durations.length]),
          timing: timings[i % timings.length].replace(/\s+/g, ''),
        };
      });
      // Los tokens, resueltos por el navegador en una sonda: el valor crudo de la variable viene
      // minificado (`.2`) y no se compara con el calculado (`0.2`).
      const probe = document.createElement('span');
      probe.style.transition = 'opacity var(--dur-base) var(--ease-standard)';
      document.body.appendChild(probe);
      const probeStyle = getComputedStyle(probe);
      const duration = parseFloat(probeStyle.transitionDuration);
      const timing = probeStyle.transitionTimingFunction.replace(/\s+/g, '');
      probe.remove();
      return {
        sameNode: document.querySelector(sel) === node,
        className: node.getAttribute('class') ?? '',
        rotate: s.rotate,
        scale: s.scale,
        opacity: s.opacity,
        transitions,
        token: { duration, timing },
      };
    },
    { k: key, sel: selector },
  );
}

/** Grados de un `rotate` calculado (`none` es 0). */
function degrees(rotate: string): number {
  if (rotate === 'none') return 0;
  const value = parseFloat(rotate.trim().split(/\s+/).pop() ?? '');
  if (Number.isNaN(value)) throw new Error(`rotate no reconocido: ${rotate}`);
  return value;
}

/** Factores de un `scale` calculado (`none` es 1). */
function scaleFactors(scale: string): number[] {
  if (scale === 'none') return [1];
  return scale.trim().split(/\s+/).map((part) =>
    part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part),
  );
}

function expectTokenTransition(state: Settled, property: string, what: string): void {
  const t = state.transitions[property];
  expect(t, `${what}: «${property}» no está en transition-property`).toBeDefined();
  if (!t) return;
  expect.soft(t.duration, `${what}: duración de ${property}`).toBeCloseTo(state.token.duration, 3);
  expect.soft(t.timing, `${what}: curva de ${property}`).toBe(state.token.timing);
}

function expectNoMeasurableTransition(state: Settled, properties: readonly string[], what: string): void {
  for (const property of properties) {
    const t = state.transitions[property];
    if (!t) continue;
    expect.soft(t.duration, `${what}: ${property} dura ${t.duration}s con movimiento reducido`).toBeLessThanOrEqual(
      REDUCED_MAX_SECONDS,
    );
  }
}

// --- Tooltips ---

async function tabTo(page: Page, selector: string, what: string): Promise<void> {
  for (let i = 0; i < MAX_TABS; i += 1) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);
    if (hit) return;
  }
  throw new Error(`${what}: ${MAX_TABS} pulsaciones de Tab no llegaron a ${selector}`);
}

/** El tooltip abierto con ese texto, su caja ya asentada, la del botón y la ventana. */
async function tooltipFit(page: Page, testId: string, text: string) {
  const tooltip = page.locator(TOOLTIP_SELECTOR).filter({ hasText: text });
  await expect(tooltip, `no aparece el tooltip «${text}»`).toBeVisible({ timeout: 10_000 });
  return page.evaluate(
    async ({ id, sel, label }) => {
      const popup = Array.from(document.querySelectorAll<HTMLElement>(sel)).find(
        (el) => el.textContent === label,
      );
      const button = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!popup || !button) return null;
      await Promise.all(popup.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)));
      const toBox = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
      return {
        text: popup.textContent,
        ariaLabel: button.getAttribute('aria-label'),
        tooltip: toBox(popup.getBoundingClientRect()),
        button: toBox(button.getBoundingClientRect()),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    },
    { id: testId, sel: TOOLTIP_SELECTOR, label: text },
  );
}

function expectTooltipBelowAndInside(
  fit: Awaited<ReturnType<typeof tooltipFit>>,
  text: string,
  what: string,
): void {
  expect(fit, `${what}: no hay tooltip o botón`).not.toBeNull();
  if (!fit) return;
  const { tooltip: t, button: b, viewport: v } = fit;
  const fmt = (x: Box) => `${Math.round(x.width)}x${Math.round(x.height)}@(${Math.round(x.x)},${Math.round(x.y)})`;
  log(`${what}: tooltip ${fmt(t)} botón ${fmt(b)} ventana ${v.width}x${v.height}`);
  expect.soft(fit.text, `${what}: texto del tooltip`).toBe(text);
  expect.soft(fit.ariaLabel, `${what}: el nombre accesible no es el texto del tooltip`).toBe(text);
  expect.soft(t.y, `${what}: el tooltip no está debajo del botón`).toBeGreaterThanOrEqual(
    b.y + b.height - TOLERANCE_PX,
  );
  expect.soft(
    t.x >= -TOLERANCE_PX &&
      t.y >= -TOLERANCE_PX &&
      t.x + t.width <= v.width + TOLERANCE_PX &&
      t.y + t.height <= v.height + TOLERANCE_PX,
    `${what}: el tooltip se sale de la ventana`,
  ).toBe(true);
}

test.beforeAll(async () => {
  // Con `fullyParallel` un worker puede volver a este archivo tras su `afterAll`: la sesión
  // guardada sería la de un usuario ya borrado y el layout cortaría a `/login?sesion=fin`.
  session = null;
  const orphanCutoff = new Date(Date.now() - ORPHAN_MIN_AGE_MS);
  const orphans = await prisma.company.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX }, createdAt: { lt: orphanCutoff } },
    select: { id: true },
  });
  const orphanIds = orphans.map((c) => c.id);
  if (orphanIds.length > 0) {
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
      firstNames: `Qc257${RUN_ID.slice(0, 8)}`,
      lastNames: 'Shell',
      birthDate: new Date('1990-01-01'),
      email: `${adminUser.username}@example.test`,
      phone: '+573000000000',
      documentTypeCode: DOCUMENT_TYPE_CC,
      documentNumber: adminUser.username,
      username: adminUser.username,
      passwordHash: await createPasswordHash(adminUser.password),
      roleId: role.id,
      companyId,
    },
    select: { id: true },
  });
});

test.afterAll(async () => {
  session = null;
  try {
    if (companyId) await prisma.user.deleteMany({ where: { companyId } });
  } finally {
    try {
      await prisma.company.deleteMany({ where: { name: companyName } });
    } finally {
      await prisma.$disconnect();
    }
  }
});

// `next dev` compila cada ruta bajo demanda y bcrypt tarda a propósito.
test.setTimeout(180_000);

test.describe('flecha del control de la barra', () => {
  test('R6 la pastilla gira la misma flecha en --dur-base con --ease-standard, al plegar y al desplegar', async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await enter(browser, baseURL as string);
    await settleDesktop(page);
    const toggle = page.getByTestId(EDGE_TOGGLE_TESTID);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await watch(page, 'edge', EDGE_ARROW);

    const before = await settled(page, 'edge', EDGE_ARROW);
    log(`R6 pastilla expandida clase="${before.className}" rotate=${before.rotate}`);
    expect.soft(before.className).toContain(CHEVRON_CLASS);
    expect.soft(degrees(before.rotate)).toBe(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => runsOf(page, 'edge'), { message: 'la flecha no giró al plegar' }).toContain('rotate');
    const folded = await settled(page, 'edge', EDGE_ARROW);
    log(`R6 pastilla plegada rotate=${folded.rotate} transiciones=${JSON.stringify(folded.transitions)}`);
    expect.soft(folded.sameNode, 'la flecha se sustituyó por otro nodo al plegar').toBe(true);
    expect.soft(folded.className).toContain(CHEVRON_CLASS);
    expect.soft(degrees(folded.rotate)).toBe(180);
    expectTokenTransition(folded, 'rotate', 'pastilla');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(async () => (await runsOf(page, 'edge')).filter((p) => p === 'rotate').length, {
        message: 'la flecha no giró al desplegar',
      })
      .toBe(2);
    const unfolded = await settled(page, 'edge', EDGE_ARROW);
    expect.soft(unfolded.sameNode, 'la flecha se sustituyó por otro nodo al desplegar').toBe(true);
    expect.soft(degrees(unfolded.rotate)).toBe(0);
    await context.close();
  });

  test('R6 el control de la cabecera en 390 px gira la misma flecha al abrir el panel', async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await enter(browser, baseURL as string, { viewport: NARROW_VIEWPORT });
    await settleNarrow(page);
    await watch(page, 'header', HEADER_ARROW);

    const before = await settled(page, 'header', HEADER_ARROW);
    log(`R6 cabecera cerrada clase="${before.className}" rotate=${before.rotate}`);
    expect.soft(before.className).toContain(CHEVRON_CLASS);
    expect.soft(degrees(before.rotate)).toBe(180);

    const toggle = page.getByTestId(HEADER_TOGGLE_TESTID);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => runsOf(page, 'header'), { message: 'la flecha no giró al abrir' }).toContain('rotate');
    const opened = await settled(page, 'header', HEADER_ARROW);
    log(`R6 cabecera abierta rotate=${opened.rotate} transiciones=${JSON.stringify(opened.transitions)}`);
    expect.soft(opened.sameNode, 'la flecha se sustituyó por otro nodo al abrir').toBe(true);
    expect.soft(degrees(opened.rotate)).toBe(0);
    expectTokenTransition(opened, 'rotate', 'cabecera');
    await context.close();
  });

  const quietCases = [
    {
      name: 'en 390 px con la cookie de barra expandida',
      viewport: NARROW_VIEWPORT,
      collapsed: false,
      settle: settleNarrow,
    },
    {
      name: 'en escritorio con la cookie de barra plegada',
      viewport: DESKTOP_VIEWPORT,
      collapsed: true,
      settle: settleDesktop,
    },
  ] as const;

  for (const quiet of quietCases) {
    test(`R7 al cargar e hidratar ninguna flecha gira sola (${quiet.name})`, async ({ browser, baseURL }) => {
      const { context, page } = await enter(browser, baseURL as string, {
        viewport: quiet.viewport,
        collapsed: quiet.collapsed,
        // Desde `document_start`: cualquier transición que arranque al hidratar queda anotada.
        initScript: () => {
          const runs: string[] = [];
          (window as unknown as { __qc257Load: string[] }).__qc257Load = runs;
          document.addEventListener(
            'transitionrun',
            (event) => {
              const target = event.target as Element;
              const control = target.closest?.(
                '[data-testid="private-sidebar-toggle"], [data-testid="private-sidebar-edge-toggle"]',
              );
              if (control && target.tagName.toLowerCase() === 'svg') {
                runs.push(`${control.getAttribute('data-testid')}:${(event as TransitionEvent).propertyName}`);
              }
            },
            true,
          );
        },
      });
      await quiet.settle(page);

      const result = await page.evaluate(async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        const arrows = Array.from(
          document.querySelectorAll(
            '[data-testid="private-sidebar-toggle"] svg, [data-testid="private-sidebar-edge-toggle"] svg',
          ),
        );
        return {
          runs: (window as unknown as { __qc257Load: string[] }).__qc257Load,
          arrows: arrows.length,
          running: arrows.flatMap((svg) =>
            svg.getAnimations().map((a) => (a as CSSTransition).transitionProperty ?? a.constructor.name),
          ),
        };
      }, QUIET_WINDOW_MS);
      log(`R7 ${quiet.name}: flechas=${result.arrows} transiciones=${JSON.stringify(result.runs)} en curso=${JSON.stringify(result.running)}`);
      expect(result.arrows, 'no hay ninguna flecha que vigilar').toBeGreaterThan(0);
      expect.soft(result.runs, 'una flecha giró al cargar').toEqual([]);
      expect.soft(result.running, 'una flecha tiene una transición en curso tras cargar').toEqual([]);
      await context.close();
    });
  }
});

const tooltipViewports = [
  { name: 'escritorio', viewport: DESKTOP_VIEWPORT },
  { name: '390 px', viewport: NARROW_VIEWPORT },
] as const;

const tooltipTargets = [
  { req: 'R10', testId: THEME_TOGGLE_TESTID, text: THEME_TOGGLE_TEXT },
  { req: 'R11', testId: LOGOUT_TESTID, text: LOGOUT_TEXT },
] as const;

test.describe('tooltips de la cabecera', () => {
  for (const { name, viewport } of tooltipViewports) {
    test(`R10 R11 con el puntero cada tooltip sale debajo, dentro de la ventana, y se va al salir (${name})`, async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { viewport });
      await (viewport === NARROW_VIEWPORT ? settleNarrow(page) : settleDesktop(page));

      for (const target of tooltipTargets) {
        await page.getByTestId(target.testId).hover();
        expectTooltipBelowAndInside(
          await tooltipFit(page, target.testId, target.text),
          target.text,
          `${target.req} puntero ${name}`,
        );
        await page.mouse.move(Math.round(viewport.width / 2), viewport.height - 1);
        await expect(
          page.locator(TOOLTIP_SELECTOR).filter({ hasText: target.text }),
          `${target.req} puntero ${name}: el tooltip no se oculta al salir`,
        ).toHaveCount(0);
      }
      await context.close();
    });

    test(`R10 R11 con el teclado cada tooltip sale debajo al llegar el foco, dentro de la ventana (${name})`, async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { viewport });
      await (viewport === NARROW_VIEWPORT ? settleNarrow(page) : settleDesktop(page));
      await page.mouse.move(Math.round(viewport.width / 2), viewport.height - 1);

      for (const target of tooltipTargets) {
        await tabTo(page, `[data-testid="${target.testId}"]`, `${target.req} teclado ${name}`);
        expectTooltipBelowAndInside(
          await tooltipFit(page, target.testId, target.text),
          target.text,
          `${target.req} teclado ${name}`,
        );
      }
      await expect(
        page.locator(TOOLTIP_SELECTOR).filter({ hasText: THEME_TOGGLE_TEXT }),
        `teclado ${name}: el tooltip de tema sigue abierto con el foco en cerrar sesión`,
      ).toHaveCount(0);
      await context.close();
    });
  }
});

test.describe('idioma del documento', () => {
  test('R14 html[lang=es] en el login, sin sesión', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL: baseURL as string });
    const page = await context.newPage();
    await page.goto(LOGIN_ROUTE);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await context.close();
  });

  test('R14 html[lang=es] en una pantalla privada', async ({ browser, baseURL }) => {
    const { context, page, activeRoute } = await enter(browser, baseURL as string);
    log(`R14 privada ${activeRoute}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await context.close();
  });
});

test.describe('sol y luna', () => {
  test('R17 al pasar a oscuro el sol sale girando a escala 0 y opacidad 0, y la luna entra a escala 1', async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await enter(browser, baseURL as string, { theme: 'light' });
    await settleDesktop(page);
    await expect(page.locator('html')).not.toHaveClass(new RegExp(`\\b${THEME_DARK_CLASS}\\b`));
    await watch(page, 'sun', SUN_SELECTOR);
    await watch(page, 'moon', MOON_SELECTOR);

    await page.getByTestId(THEME_TOGGLE_TESTID).click();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${THEME_DARK_CLASS}\\b`));
    await expect
      .poll(async () => [...new Set(await runsOf(page, 'sun'))].sort(), { message: 'el sol no se cruzó' })
      .toEqual(['opacity', 'rotate', 'scale']);
    await expect
      .poll(async () => [...new Set(await runsOf(page, 'moon'))].sort(), { message: 'la luna no se cruzó' })
      .toEqual(['opacity', 'rotate', 'scale']);

    const sun = await settled(page, 'sun', SUN_SELECTOR);
    const moon = await settled(page, 'moon', MOON_SELECTOR);
    log(`R17 sol rotate=${sun.rotate} scale=${sun.scale} opacity=${sun.opacity}; luna rotate=${moon.rotate} scale=${moon.scale} opacity=${moon.opacity}`);
    expect.soft(degrees(sun.rotate), 'el sol no giró 90°').toBe(90);
    expect.soft(scaleFactors(sun.scale).every((f) => f === 0), `escala del sol ${sun.scale}`).toBe(true);
    expect.soft(Number(sun.opacity), 'opacidad del sol').toBe(0);
    expect.soft(degrees(moon.rotate), 'la luna no llegó a 0°').toBe(0);
    expect.soft(scaleFactors(moon.scale).every((f) => f === 1), `escala de la luna ${moon.scale}`).toBe(true);
    expect.soft(Number(moon.opacity), 'opacidad de la luna').toBe(1);
    for (const property of ['rotate', 'scale', 'opacity']) {
      expectTokenTransition(sun, property, 'sol');
      expectTokenTransition(moon, property, 'luna');
    }
    await context.close();
  });
});

test.describe('movimiento reducido', () => {
  test('R19 la flecha y los iconos de tema llegan al estado final sin transición medible', async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await enter(browser, baseURL as string, {
      theme: 'light',
      reducedMotion: 'reduce',
    });
    await settleDesktop(page);
    await watch(page, 'edge', EDGE_ARROW);
    await watch(page, 'sun', SUN_SELECTOR);
    await watch(page, 'moon', MOON_SELECTOR);

    const toggle = page.getByTestId(EDGE_TOGGLE_TESTID);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const arrow = await settled(page, 'edge', EDGE_ARROW);
    log(`R19 flecha rotate=${arrow.rotate} transiciones=${JSON.stringify(arrow.transitions)}`);
    expect.soft(degrees(arrow.rotate)).toBe(180);
    expectNoMeasurableTransition(arrow, ['rotate', 'transform'], 'flecha');

    await page.getByTestId(THEME_TOGGLE_TESTID).click();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${THEME_DARK_CLASS}\\b`));
    const sun = await settled(page, 'sun', SUN_SELECTOR);
    const moon = await settled(page, 'moon', MOON_SELECTOR);
    log(`R19 sol ${sun.scale}/${sun.opacity} luna ${moon.scale}/${moon.opacity} transiciones=${JSON.stringify(sun.transitions)}`);
    expect.soft(scaleFactors(sun.scale).every((f) => f === 0)).toBe(true);
    expect.soft(Number(sun.opacity)).toBe(0);
    expect.soft(scaleFactors(moon.scale).every((f) => f === 1)).toBe(true);
    expect.soft(Number(moon.opacity)).toBe(1);
    expectNoMeasurableTransition(sun, ['rotate', 'scale', 'opacity'], 'sol');
    expectNoMeasurableTransition(moon, ['rotate', 'scale', 'opacity'], 'luna');
    await context.close();
  });
});
