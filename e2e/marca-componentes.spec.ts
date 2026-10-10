/**
 * E2E de los componentes con la marca: cajas, colores y contrastes CALCULADOS por un navegador real.
 *
 * jsdom no calcula cajas ni resuelve la cascada, y la cascada es justo lo que falla en el carril
 * colapsado: una regla sin capa con `!important` pierde contra una utilidad con `!important` en
 * capa, y un test que solo lee el texto del CSS sigue en verde. Aqui se mide con
 * `getBoundingClientRect` y `getComputedStyle`, en claro y en oscuro.
 *
 * DATOS: una empresa, un Administrador del seed y un cliente por worker, con el prefijo
 * `qc227_e2e_` y el `RUN_ID` del proceso. El cliente da una fila a la lista de Clientes, que es la
 * tabla donde se miden cabecera, celdas y campo (sin filas, `DataTable` no pinta la cabecera). Se entra una sola vez por worker por el login real (`loginAndLand`) y las
 * pruebas reutilizan esa sesion en contextos nuevos, cada uno con sus cookies de tema y de barra.
 * El `afterAll` borra por la empresa exacta del worker; la limpieza defensiva, por prefijo y edad.
 *
 * RUTA ACTIVA: el aterrizaje del Administrador, que se exige que sea un enlace de primer nivel de
 * `PRIVATE_NAV_ITEMS`. No hay ruta escrita a mano.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { normalizeCustomerText } from '@/lib/modules/clientes';
import { DOCUMENT_TYPE_CC, ROLE_ADMINISTRADOR, normalizeCompanyName } from '@/lib/modules/identity';
import { createPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { prisma } from '@/lib/shared/db/prisma';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import { CUSTOMERS_ROUTE } from '@/lib/shared/routes';
import { readSidebarOpenState, SIDEBAR_STATE_COOKIE } from '@/lib/shared/ui/sidebar-state';
import { THEME_COOKIE } from '@/lib/shared/ui/theme-state';

import { createFixtureUser } from './helpers/fixture-user';
import { loginAndLand } from './helpers/landing';

const FIXTURE_PREFIX = 'qc227_e2e_';
const RUN_ID = randomUUID().replace(/-/g, '');
/** Edad minima de un resto de otra ejecucion: el otro proyecto corre a la vez con sus filas. */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
/** Por debajo de 768 px la barra es un `Sheet` y solo se ve el control del encabezado. */
const NARROW_VIEWPORT = { width: 390, height: 844 };

/** Tolerancia de toda comparacion de cajas, en px. */
const TOLERANCE_PX = 1;
const RAIL_BUTTON_PX = 44;
const ISOTYPE_PX = 32;
const EXPANDED_LOGO_HEIGHT_PX = 28;
const MIN_TOUCH_PX = 44;
const MIN_CONTROL_ICON_PX = 14;
const MIN_CONTRAST = 4.5;

/** `data-testid` de cliente (sus modulos son de cliente y no se importan aqui). */
const BRAND_LINK_TESTID = 'private-brand-link';
const USER_INITIALS_TESTID = 'private-user-initials';
const EDGE_TOGGLE_TESTID = 'private-sidebar-edge-toggle';
const HEADER_TOGGLE_TESTID = 'private-sidebar-toggle';

const OPEN_ICON_CLASS = 'lucide-panel-left-open';
const CLOSE_ICON_CLASS = 'lucide-panel-left-close';

/** Por `data-sidebar`: los items con submenu llevan el `data-slot` de su disparador. */
const CONTENT_BUTTONS = '[data-slot="sidebar-content"] [data-sidebar="menu-button"]';

type Theme = 'light' | 'dark';
const THEMES: readonly Theme[] = ['light', 'dark'];

/** Valor de la cookie que deja la barra colapsada, comprobado contra el lector del layout. */
const COLLAPSED_COOKIE_VALUE = String(false);
const EXPANDED_COOKIE_VALUE = String(true);

type Credentials = { readonly username: string; readonly password: string };

const adminUser: Credentials = {
  username: `${FIXTURE_PREFIX}admin_${RUN_ID}`,
  password: `Qc227-Admin-${RUN_ID.slice(0, 12)}`,
};

const companyName = `${FIXTURE_PREFIX}empresa_${RUN_ID}`;
let companyId: string | null = null;

/** El cliente sembrado: la fila de la tabla de Clientes. */
const seededCustomer = {
  firstNames: `Qc227${RUN_ID.slice(0, 8)}`,
  lastNames: `Marca${RUN_ID}`,
  city: `${FIXTURE_PREFIX}ciudad_${RUN_ID}`,
} as const;

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
let session: { state: StorageState; activeRoute: string; activeTestId: string } | null = null;

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

const centerX = (box: Box) => box.x + box.width / 2;
const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (box: Box) =>
  `${round(box.width)}x${round(box.height)} @(${round(box.x)},${round(box.y)}) cx=${round(centerX(box))}`;

// --- oklch -> sRGB lineal y contraste WCAG, copiados de tests/unit/theme/color-tokens.test.ts.
// Playwright no importa codigo de Vitest. Se amplia solo el lector: el navegador tambien devuelve
// `rgb()`, `color(srgb ...)`, porcentajes y alfa. ---

type LinearRgba = { r: number; g: number; b: number; a: number };

/** r,g,b en sRGB lineal (0..1): justo lo que pide la luminancia relativa de WCAG. */
function oklchToLinearSrgb(l: number, c: number, h: number): { r: number; g: number; b: number } {
  const hRad = (h * Math.PI) / 180;
  return oklabToLinearSrgb(l, c * Math.cos(hRad), c * Math.sin(hRad));
}

function oklabToLinearSrgb(l: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lCubed = l_ ** 3;
  const mCubed = m_ ** 3;
  const sCubed = s_ ** 3;

  const r = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  const g = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  const b2 = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed;

  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return { r: clamp(r), g: clamp(g), b: clamp(b2) };
}

/** CIE Lab (D50) a sRGB lineal, con las matrices de CSS Color 4. Chromium serializa asi algunos colores. */
function labToLinearSrgb(lightness: number, a: number, b: number): { r: number; g: number; b: number } {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const f1 = (lightness + 16) / 116;
  const f0 = a / 500 + f1;
  const f2 = f1 - b / 200;
  const x = (f0 ** 3 > epsilon ? f0 ** 3 : (116 * f0 - 16) / kappa) * (0.3457 / 0.3585);
  const y = lightness > kappa * epsilon ? f1 ** 3 : lightness / kappa;
  const z = (f2 ** 3 > epsilon ? f2 ** 3 : (116 * f2 - 16) / kappa) * ((1 - 0.3457 - 0.3585) / 0.3585);
  const x65 = 0.955473421488075 * x - 0.02309845494876471 * y + 0.06325924320057072 * z;
  const y65 = -0.0283697093338637 * x + 1.0099953980813041 * y + 0.021041441191917323 * z;
  const z65 = 0.012314014864481998 * x - 0.020507649298898964 * y + 1.330365926242124 * z;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return {
    r: clamp(3.2409699419045226 * x65 - 1.537383177570094 * y65 - 0.4986107602930034 * z65),
    g: clamp(-0.9692436362808796 * x65 + 1.8759675015077202 * y65 + 0.04155505740717559 * z65),
    b: clamp(0.05563007969699366 * x65 - 0.20397695888897652 * y65 + 1.0569715142428786 * z65),
  };
}

const srgbToLinear =(v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function parseNumber(token: string, percentScale: number): number {
  return token.endsWith('%') ? (Number(token.slice(0, -1)) / 100) * percentScale : Number(token);
}

function parseCssColor(value: string): LinearRgba {
  const v = value.trim();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const inner = v.match(/^[a-z-]+\((.*)\)$/i)?.[1];
  if (!inner) throw new Error(`Color no reconocido: ${value}`);
  const [main, alphaPart] = inner.split('/').map((s) => s.trim());
  const alpha = alphaPart === undefined ? 1 : parseNumber(alphaPart, 1);
  if (v.startsWith('oklch(')) {
    const [l, c, h] = main.split(/\s+/);
    return { ...oklchToLinearSrgb(parseNumber(l, 1), parseNumber(c, 0.4), Number(h)), a: alpha };
  }
  if (v.startsWith('oklab(')) {
    const [l, a, b] = main.split(/\s+/);
    return { ...oklabToLinearSrgb(parseNumber(l, 1), parseNumber(a, 0.4), parseNumber(b, 0.4)), a: alpha };
  }
  if (v.startsWith('lab(')) {
    const [l, a, b] = main.split(/\s+/);
    return { ...labToLinearSrgb(parseNumber(l, 100), parseNumber(a, 125), parseNumber(b, 125)), a: alpha };
  }
  if (v.startsWith('color(srgb')) {
    const [, r, g, b] = main.split(/\s+/);
    return { r: srgbToLinear(Number(r)), g: srgbToLinear(Number(g)), b: srgbToLinear(Number(b)), a: alpha };
  }
  if (v.startsWith('rgb')) {
    const parts = main.split(/[\s,]+/).filter(Boolean);
    const [r, g, b] = parts.slice(0, 3).map((p) => parseNumber(p, 255) / 255);
    const a = parts[3] === undefined ? alpha : parseNumber(parts[3], 1);
    return { r: srgbToLinear(r), g: srgbToLinear(g), b: srgbToLinear(b), a };
  }
  throw new Error(`Color no reconocido: ${value}`);
}

/** Compone una capa con alfa sobre otra opaca, en sRGB codificado como hace el navegador. */
function over(top: LinearRgba, bottom: LinearRgba): LinearRgba {
  const mix = (t: number, b: number) =>
    srgbToLinear(linearToSrgb(t) * top.a + linearToSrgb(b) * (1 - top.a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

function relativeLuminance({ r, g, b }: LinearRgba): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: LinearRgba, background: LinearRgba): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Contraste del `color` del boton contra su fondo efectivo (capas de abajo arriba hasta una opaca). */
function controlContrast(color: string, backgrounds: readonly string[]): number {
  const layers = backgrounds.map(parseCssColor);
  let background: LinearRgba = { r: 1, g: 1, b: 1, a: 1 };
  for (const layer of [...layers].reverse()) {
    if (layer.a === 0) continue;
    background = layer.a >= 1 ? layer : over(layer, background);
  }
  const fg = parseCssColor(color);
  return contrastRatio(fg.a >= 1 ? fg : over(fg, background), background);
}

// --- Sesion y entrada ---

function activeLinkFor(route: string): NavLink {
  const item = PRIVATE_NAV_ITEMS.find(
    (candidate): candidate is NavLink => candidate.kind === 'link' && candidate.href === route,
  );
  if (!item) {
    throw new Error(`el aterrizaje ${route} no es un enlace de primer nivel de PRIVATE_NAV_ITEMS`);
  }
  return item;
}

async function ensureSession(browser: Browser, baseURL: string) {
  if (session) return session;
  const context = await browser.newContext({ baseURL, viewport: DESKTOP_VIEWPORT });
  const page = await context.newPage();
  const activeRoute = await loginAndLand(page, adminUser);
  const state = await context.storageState();
  await context.close();
  session = { state, activeRoute, activeTestId: activeLinkFor(activeRoute).testId };
  return session;
}

type EnterOptions = {
  readonly theme: Theme;
  readonly collapsed?: boolean;
  readonly viewport?: { width: number; height: number };
};

async function enter(
  browser: Browser,
  baseURL: string,
  { theme, collapsed = false, viewport = DESKTOP_VIEWPORT }: EnterOptions,
): Promise<{ context: BrowserContext; page: Page; activeTestId: string }> {
  const { state, activeRoute, activeTestId } = await ensureSession(browser, baseURL);
  const sidebarValue = collapsed ? COLLAPSED_COOKIE_VALUE : EXPANDED_COOKIE_VALUE;
  expect(readSidebarOpenState(sidebarValue), 'la cookie de barra no da el estado pedido').toBe(
    !collapsed,
  );

  const context = await browser.newContext({
    baseURL,
    viewport,
    storageState: state,
    reducedMotion: 'reduce',
  });
  const { hostname } = new URL(baseURL);
  await context.addCookies([
    { name: THEME_COOKIE, value: theme, domain: hostname, path: '/' },
    { name: SIDEBAR_STATE_COOKIE, value: sidebarValue, domain: hostname, path: '/' },
  ]);
  const page = await context.newPage();
  await page.goto(activeRoute);
  await expect(page).toHaveURL((url) => url.pathname === activeRoute, { timeout: 60_000 });
  return { context, page, activeTestId };
}

/** Espera a que el indicador hidrate y a que el contenedor deje de cambiar de ancho. */
async function settleDesktop(page: Page, collapsed: boolean): Promise<void> {
  await expect(page.locator('[data-indicator-ready]').first()).toBeAttached({ timeout: 60_000 });
  if (collapsed) {
    await expect(page.locator('[data-slot="sidebar"][data-collapsible="icon"]')).toBeAttached();
  }
  const container = page.locator('[data-slot="sidebar-container"]');
  let previous = -1;
  await expect
    .poll(
      async () => {
        const width = (await container.boundingBox())?.width ?? -2;
        const stable = width === previous;
        previous = width;
        return stable;
      },
      { message: 'el ancho del contenedor de la barra no se estabilizo', intervals: [150] },
    )
    .toBe(true);
}

async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`sin caja: ${selector}`);
  return b;
}

async function railAxis(page: Page): Promise<number> {
  return centerX(await box(page, '[data-slot="sidebar-inner"]'));
}

function expectCentered(
  measured: Box,
  axis: number,
  what: string,
  soft: boolean = true,
): void {
  const e = soft ? expect.soft : expect;
  e(Math.abs(centerX(measured) - axis), `${what} no esta centrado en el eje ${round(axis)}: ${fmt(measured)}`).toBeLessThanOrEqual(TOLERANCE_PX);
}

function expectSquare(measured: Box, size: number, what: string): void {
  expect.soft(Math.abs(measured.width - size), `${what} ancho ${fmt(measured)}`).toBeLessThanOrEqual(TOLERANCE_PX);
  expect.soft(Math.abs(measured.height - size), `${what} alto ${fmt(measured)}`).toBeLessThanOrEqual(TOLERANCE_PX);
}

function log(line: string): void {
  console.log(`[medida] ${test.info().project.name} ${line}`);
}

/** Indicador de la lista del boton dado y su opacidad. */
async function indicatorFor(page: Page, testId: string) {
  return page.evaluate((id) => {
    const button = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const container = button?.closest('[data-slot="sidebar-menu"]')?.parentElement;
    const indicator = container?.querySelector<HTMLElement>(
      ':scope > [data-slot="sidebar-active-indicator"][data-variant="menu"]',
    );
    if (!button || !indicator) return null;
    const a = button.getBoundingClientRect();
    const b = indicator.getBoundingClientRect();
    return {
      active: button.hasAttribute('data-active'),
      opacity: getComputedStyle(indicator).opacity,
      button: { x: a.x, y: a.y, width: a.width, height: a.height },
      indicator: { x: b.x, y: b.y, width: b.width, height: b.height },
    };
  }, testId);
}

function maxDelta(a: Box, b: Box): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height),
  );
}

/** Lo que R38 mide de un control: caja del icono, a quien toca su centro, color y fondos. */
async function controlProbe(page: Page, testId: string) {
  return page.evaluate(async (id) => {
    const button = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const svg = button?.querySelector<SVGElement>('svg');
    if (!button || !svg) return null;
    // Con movimiento reducido la transicion dura 0.01 ms, pero WebKit puede leerla a medias.
    await Promise.all(button.getAnimations({ subtree: true }).map((a) => a.finished));
    const b = button.getBoundingClientRect();
    const s = svg.getBoundingClientRect();
    const hit = document.elementFromPoint(s.x + s.width / 2, s.y + s.height / 2);
    const backgrounds: string[] = [];
    for (let el: Element | null = button; el; el = el.parentElement) {
      backgrounds.push(getComputedStyle(el).backgroundColor);
    }
    return {
      button: { x: b.x, y: b.y, width: b.width, height: b.height },
      icon: { x: s.x, y: s.y, width: s.width, height: s.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hitInside: hit !== null && (hit === button || button.contains(hit)),
      hitDescription: hit ? `${hit.tagName.toLowerCase()}[data-slot=${hit.getAttribute('data-slot')}]` : 'null',
      color: getComputedStyle(button).color,
      backgrounds,
      iconClass: svg.getAttribute('class') ?? '',
    };
  }, testId);
}

async function expectControlIcon(page: Page, testId: string, what: string): Promise<void> {
  const icon = page.getByTestId(testId).locator('svg').first();
  await expect.soft(icon, `${what}: icono no visible`).toBeVisible();
  const probe = await controlProbe(page, testId);
  expect(probe, `${what}: no hay boton o icono`).not.toBeNull();
  if (!probe) return;
  const ratio = controlContrast(probe.color, probe.backgrounds);
  const opaqueBg = probe.backgrounds.find((bg) => parseCssColor(bg).a > 0) ?? 'ninguno';
  log(
    `${what}: boton ${fmt(probe.button)} icono ${fmt(probe.icon)} hit=${probe.hitDescription} color=${probe.color} fondo=${opaqueBg} contraste=${round(ratio)} clase="${probe.iconClass}"`,
  );
  const { icon: i, button: b, viewport: v } = probe;
  expect.soft(i.width, `${what}: ancho del icono`).toBeGreaterThanOrEqual(MIN_CONTROL_ICON_PX);
  expect.soft(i.height, `${what}: alto del icono`).toBeGreaterThanOrEqual(MIN_CONTROL_ICON_PX);
  expect.soft(
    i.x >= b.x - TOLERANCE_PX &&
      i.y >= b.y - TOLERANCE_PX &&
      i.x + i.width <= b.x + b.width + TOLERANCE_PX &&
      i.y + i.height <= b.y + b.height + TOLERANCE_PX,
    `${what}: icono fuera del boton`,
  ).toBe(true);
  expect.soft(
    i.x >= 0 && i.y >= 0 && i.x + i.width <= v.width && i.y + i.height <= v.height,
    `${what}: icono fuera de la ventana`,
  ).toBe(true);
  expect.soft(probe.hitInside, `${what}: algo tapa el icono (${probe.hitDescription})`).toBe(true);
  expect.soft(ratio, `${what}: contraste ${probe.color} sobre ${opaqueBg}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
}

async function iconClass(page: Page, testId: string): Promise<string> {
  return (await page.getByTestId(testId).locator('svg').first().getAttribute('class')) ?? '';
}

// --- Tablas, barra, botones y campos (design.md > 11): colores y fuentes calculados ---

/** Contraste minimo de un componente de interfaz (contorno, borde de campo). */
const MIN_UI_CONTRAST = 3;
/** Tolerancia por canal (sRGB lineal) al comparar dos colores calculados. */
const COLOR_EPSILON = 0.003;
/** Tope de pulsaciones de tabulador para llegar a un control. */
const MAX_TABS = 80;

const SEARCH_BOX_TESTID = 'data-table-search';
const CUSTOMERS_TITLE_TESTID = 'clientes-title';
const NAME_COLUMN_ID = 'lastNames';
const DATE_COLUMN_ID = 'createdAt';
const INSET_BUTTON = '[data-slot="sidebar-inset"] [data-slot="button"]';

/** Primer item con submenu de la navegacion, tomado de la constante y no escrito a mano. */
const FIRST_GROUP = (() => {
  const group = PRIVATE_NAV_ITEMS.find((item) => item.kind === 'group');
  if (!group) throw new Error('PRIVATE_NAV_ITEMS no tiene ningun item con submenu');
  return group;
})();

/** Color calculado de un token, leido de una sonda con `color: var(--token)` en el documento. */
async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}

/** `font-family` calculada de un token de fuente, por la misma via que la de una celda. */
async function tokenFont(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.fontFamily = `var(${name})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).fontFamily;
    probe.remove();
    return value;
  }, token);
}

function sameColor(a: string, b: string): boolean {
  const x = parseCssColor(a);
  const y = parseCssColor(b);
  return (
    Math.abs(x.r - y.r) <= COLOR_EPSILON &&
    Math.abs(x.g - y.g) <= COLOR_EPSILON &&
    Math.abs(x.b - y.b) <= COLOR_EPSILON &&
    Math.abs(x.a - y.a) <= COLOR_EPSILON
  );
}

function expectColor(actual: string, expected: string, what: string): void {
  expect.soft(sameColor(actual, expected), `${what}: ${actual} no es ${expected}`).toBe(true);
}

/** Separa una lista de `box-shadow` por las comas de primer nivel (no las de `oklch(...)`). */
function splitShadows(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Sombras `color 0 0 0 <spread>` (anillos) con su color y su grosor. */
function ringsOf(boxShadow: string): { color: string; spread: string }[] {
  if (boxShadow === 'none') return [];
  return splitShadows(boxShadow).flatMap((shadow) => {
    const color = shadow.match(/[a-z-]+\([^)]*\)|transparent/i)?.[0];
    const lengths = shadow.replace(color ?? '', '').trim().split(/\s+/);
    if (!color || lengths.length < 4) return [];
    const [x, y, blur, spread] = lengths;
    if (x !== '0px' || y !== '0px' || blur !== '0px') return [];
    return [{ color, spread }];
  });
}

/**
 * Lleva el foco con `Tab` hasta el primer elemento que case con `selector`. El WebKit de
 * Playwright tabula enlaces y botones con `Tab` (con `Alt+Tab` se salta los enlaces).
 */
async function tabTo(page: Page, selector: string, what: string): Promise<void> {
  for (let i = 0; i < MAX_TABS; i += 1) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);
    if (hit) return;
  }
  throw new Error(`${what}: ${MAX_TABS} pulsaciones de Tab no llegaron a ${selector}`);
}

/** Estilos calculados del elemento enfocado, tras acabar sus transiciones (WebKit lee a medias). */
async function focusedStyle(page: Page) {
  return page.evaluate(async () => {
    const el = document.activeElement as HTMLElement;
    await Promise.all(el.getAnimations().map((a) => a.finished));
    const s = getComputedStyle(el);
    return {
      id: el.getAttribute('data-testid'),
      label: el.getAttribute('aria-label') ?? el.textContent,
      focusVisible: el.matches(':focus-visible'),
      color: s.color,
      borderColor: s.borderTopColor,
      boxShadow: s.boxShadow,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineOffset: s.outlineOffset,
      outlineColor: s.outlineColor,
    };
  });
}

/** Abre «Clientes» con la fila sembrada pintada y la pagina hidratada. */
async function openCustomers(page: Page): Promise<void> {
  await page.goto(CUSTOMERS_ROUTE);
  await expect(page.getByTestId(CUSTOMERS_TITLE_TESTID)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-indicator-ready]').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.getByTestId(`data-table-cell-${NAME_COLUMN_ID}`).first()).toHaveText(
    seededCustomer.lastNames,
    { timeout: 60_000 },
  );
  await page.mouse.move(DESKTOP_VIEWPORT.width - 1, DESKTOP_VIEWPORT.height - 1);
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
      firstNames: `Qc227${RUN_ID.slice(0, 8)}`,
      lastNames: 'Marca',
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

for (const theme of THEMES) {
  test.describe(`carril colapsado (${theme})`, () => {
    test('R31 la marca y cada boton de primer nivel son cuadrados de 44 px centrados en el eje', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { theme, collapsed: true });
      await settleDesktop(page, true);
      const axis = await railAxis(page);
      log(`${theme} R31 carril ${fmt(await box(page, '[data-slot="sidebar-inner"]'))} contenedor ${fmt(await box(page, '[data-slot="sidebar-container"]'))}`);

      const brand = await box(page, `[data-testid="${BRAND_LINK_TESTID}"]`);
      log(`${theme} R31 marca ${fmt(brand)} desvio=${round(centerX(brand) - axis)}`);
      expectSquare(brand, RAIL_BUTTON_PX, 'enlace de marca');
      expectCentered(brand, axis, 'enlace de marca');

      const buttons = page.locator(CONTENT_BUTTONS);
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const b = await buttons.nth(i).boundingBox();
        if (!b) throw new Error(`boton ${i} sin caja`);
        const id = await buttons.nth(i).getAttribute('data-testid');
        log(`${theme} R31 boton ${id} ${fmt(b)} desvio=${round(centerX(b) - axis)}`);
        expectSquare(b, RAIL_BUTTON_PX, `boton ${id}`);
        expectCentered(b, axis, `boton ${id}`);
      }
      await context.close();
    });

    test('R32 el icono de cada boton de primer nivel y el avatar del pie estan centrados en el eje', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { theme, collapsed: true });
      await settleDesktop(page, true);
      const axis = await railAxis(page);

      const icons = page.locator(`${CONTENT_BUTTONS} > svg`);
      const count = await icons.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const b = await icons.nth(i).boundingBox();
        if (!b) throw new Error(`icono ${i} sin caja`);
        log(`${theme} R32 icono ${i} ${fmt(b)} desvio=${round(centerX(b) - axis)}`);
        expectCentered(b, axis, `icono ${i}`);
      }

      const avatar = await box(page, `[data-testid="${USER_INITIALS_TESTID}"]`);
      log(`${theme} R32 avatar ${fmt(avatar)} desvio=${round(centerX(avatar) - axis)}`);
      expectCentered(avatar, axis, 'avatar del pie');
      await context.close();
    });

    test('R33 el indicador del item activo tiene la caja del boton activo y esta centrado', async ({
      browser,
      baseURL,
    }) => {
      const { context, page, activeTestId } = await enter(browser, baseURL as string, {
        theme,
        collapsed: true,
      });
      await settleDesktop(page, true);
      const axis = await railAxis(page);

      await expect
        .poll(async () => (await indicatorFor(page, activeTestId))?.opacity, { timeout: 15_000 })
        .toBe('1');
      const fit = await indicatorFor(page, activeTestId);
      expect(fit?.active, `${activeTestId} no es el activo`).toBe(true);
      if (!fit) return;
      log(`${theme} R33 activo ${fmt(fit.button)} indicador ${fmt(fit.indicator)} desvio=${round(centerX(fit.indicator) - axis)}`);
      expect.soft(maxDelta(fit.button, fit.indicator)).toBeLessThanOrEqual(TOLERANCE_PX);
      expectCentered(fit.indicator, axis, 'indicador');
      await context.close();
    });

    test('R34 el fondo de hover de un boton inactivo cae dentro de su caja centrada', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { theme, collapsed: true });
      await settleDesktop(page, true);
      const axis = await railAxis(page);

      const inactive = page.locator(`${CONTENT_BUTTONS}:not([data-active])`).first();
      await inactive.hover();
      const background = await inactive.evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
        return getComputedStyle(el).backgroundColor;
      });
      const b = await inactive.boundingBox();
      if (!b) throw new Error('boton inactivo sin caja');
      log(`${theme} R34 hover ${fmt(b)} fondo=${background} desvio=${round(centerX(b) - axis)}`);
      expect.soft(parseCssColor(background).a, `fondo de hover transparente: ${background}`).toBeGreaterThan(0);
      expectSquare(b, RAIL_BUTTON_PX, 'boton con hover');
      expectCentered(b, axis, 'boton con hover');
      await context.close();
    });

    test('R35 el isotipo mide 32 px, esta centrado y cabe entero en el enlace de marca', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { theme, collapsed: true });
      await settleDesktop(page, true);
      const axis = await railAxis(page);

      const link = await box(page, `[data-testid="${BRAND_LINK_TESTID}"]`);
      const img = await box(page, `[data-testid="${BRAND_LINK_TESTID}"] img`);
      log(`${theme} R35 isotipo ${fmt(img)} enlace ${fmt(link)} desvio=${round(centerX(img) - axis)}`);
      expectSquare(img, ISOTYPE_PX, 'isotipo');
      expectCentered(img, axis, 'isotipo');
      expect.soft(
        img.x >= link.x - TOLERANCE_PX &&
          img.y >= link.y - TOLERANCE_PX &&
          img.x + img.width <= link.x + link.width + TOLERANCE_PX &&
          img.y + img.height <= link.y + link.height + TOLERANCE_PX,
        'isotipo fuera del enlace',
      ).toBe(true);
      await context.close();
    });

    test('R36 expandida: logo de 28 px, botones a lo ancho de su lista y de 44 px, indicador sobre el activo', async ({
      browser,
      baseURL,
    }) => {
      const { context, page, activeTestId } = await enter(browser, baseURL as string, {
        theme,
        collapsed: false,
      });
      await settleDesktop(page, false);

      const logo = await box(page, `[data-testid="${BRAND_LINK_TESTID}"] img`);
      log(`${theme} R36 logo ${fmt(logo)}`);
      expect.soft(Math.abs(logo.height - EXPANDED_LOGO_HEIGHT_PX)).toBeLessThanOrEqual(TOLERANCE_PX);

      const rows = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll<HTMLElement>(selector)).map((el) => {
          const list = el.closest('[data-slot="sidebar-menu"]') as HTMLElement;
          return {
            id: el.getAttribute('data-testid'),
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
            listWidth: list.getBoundingClientRect().width,
          };
        });
      }, CONTENT_BUTTONS);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect.soft(Math.abs(row.width - row.listWidth), `${row.id} ancho ${row.width} lista ${row.listWidth}`).toBeLessThanOrEqual(TOLERANCE_PX);
        expect.soft(row.height, `${row.id} alto`).toBeGreaterThanOrEqual(MIN_TOUCH_PX - TOLERANCE_PX);
      }
      log(`${theme} R36 botones ${rows.map((r) => `${r.id}:${round(r.width)}x${round(r.height)}/${round(r.listWidth)}`).join(' ')}`);

      await expect
        .poll(async () => (await indicatorFor(page, activeTestId))?.opacity, { timeout: 15_000 })
        .toBe('1');
      const fit = await indicatorFor(page, activeTestId);
      if (!fit) throw new Error('sin indicador');
      log(`${theme} R36 activo ${fmt(fit.button)} indicador ${fmt(fit.indicator)}`);
      expect.soft(maxDelta(fit.button, fit.indicator)).toBeLessThanOrEqual(TOLERANCE_PX);
      await context.close();
    });
  });

  test.describe(`control de colapso (${theme})`, () => {
    for (const collapsed of [false, true]) {
      const state = collapsed ? 'colapsado' : 'expandido';

      test(`R38 la pastilla del borde muestra su icono, en reposo y con hover (${state})`, async ({
        browser,
        baseURL,
      }) => {
        const { context, page } = await enter(browser, baseURL as string, { theme, collapsed });
        await settleDesktop(page, collapsed);

        await page.mouse.move(DESKTOP_VIEWPORT.width - 1, DESKTOP_VIEWPORT.height - 1);
        await expectControlIcon(page, EDGE_TOGGLE_TESTID, `${theme} R38 pastilla ${state} reposo`);
        await page.getByTestId(EDGE_TOGGLE_TESTID).hover();
        await expectControlIcon(page, EDGE_TOGGLE_TESTID, `${theme} R38 pastilla ${state} hover`);
        await context.close();
      });

      test(`R39 la pastilla pinta abrir con el panel colapsado y cerrar con el expandido, y cambia al pulsar (${state})`, async ({
        browser,
        baseURL,
      }) => {
        const { context, page } = await enter(browser, baseURL as string, { theme, collapsed });
        await settleDesktop(page, collapsed);
        const toggle = page.getByTestId(EDGE_TOGGLE_TESTID);

        const before = await iconClass(page, EDGE_TOGGLE_TESTID);
        log(`${theme} R39 pastilla ${state} clase="${before}"`);
        await expect(toggle).toHaveAttribute('aria-expanded', String(!collapsed));
        expect.soft(before).toContain(collapsed ? OPEN_ICON_CLASS : CLOSE_ICON_CLASS);

        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', String(collapsed));
        const after = await iconClass(page, EDGE_TOGGLE_TESTID);
        log(`${theme} R39 pastilla tras pulsar clase="${after}"`);
        expect.soft(after).toContain(collapsed ? CLOSE_ICON_CLASS : OPEN_ICON_CLASS);
        await context.close();
      });
    }

    test('R38 el control del encabezado en viewport angosto muestra su icono, en reposo y con hover (cerrado)', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, {
        theme,
        viewport: NARROW_VIEWPORT,
      });
      const toggle = page.getByTestId(HEADER_TOGGLE_TESTID);
      // Hasta que hidrata, el primitivo cree que es escritorio y declara el estado de escritorio.
      await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 60_000 });

      await expectControlIcon(page, HEADER_TOGGLE_TESTID, `${theme} R38 encabezado reposo`);
      await toggle.hover();
      await expectControlIcon(page, HEADER_TOGGLE_TESTID, `${theme} R38 encabezado hover`);
      await context.close();
    });

    test('R39 el control del encabezado pinta abrir con el panel cerrado y cerrar al abrirlo', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, {
        theme,
        viewport: NARROW_VIEWPORT,
      });
      const toggle = page.getByTestId(HEADER_TOGGLE_TESTID);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 60_000 });

      const before = await iconClass(page, HEADER_TOGGLE_TESTID);
      log(`${theme} R39 encabezado cerrado clase="${before}"`);
      expect.soft(before).toContain(OPEN_ICON_CLASS);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const after = await iconClass(page, HEADER_TOGGLE_TESTID);
      log(`${theme} R39 encabezado abierto clase="${after}"`);
      expect.soft(after).toContain(CLOSE_ICON_CLASS);
      await context.close();
    });
  });

  test.describe(`tablas, barra y foco calculados (${theme})`, () => {
    test('R10 la cabecera pinta --muted-foreground sobre --muted, tambien la columna fijada, con 4.5:1', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { theme });
      await openCustomers(page);
      const muted = await tokenColor(page, '--muted');
      const mutedForeground = await tokenColor(page, '--muted-foreground');
      const background = await tokenColor(page, '--background');

      const head = page.getByTestId(`data-table-head-${NAME_COLUMN_ID}`);
      const header = await head.evaluate((th) => {
        const thead = th.closest('thead') as HTMLElement;
        const svg = th.querySelector('svg');
        return {
          theadBackground: getComputedStyle(thead).backgroundColor,
          color: getComputedStyle(th).color,
          iconColor: svg ? getComputedStyle(svg).color : null,
        };
      });
      log(`${theme} R10 cabecera fondo=${header.theadBackground} texto=${header.color} icono=${header.iconColor}`);
      expectColor(header.theadBackground, muted, 'R10 fondo de la cabecera');
      expectColor(header.color, mutedForeground, 'R10 texto de la cabecera');
      if (header.iconColor !== null) {
        expectColor(header.iconColor, mutedForeground, 'R10 icono de orden');
      }
      const ratio = contrastRatio(parseCssColor(header.color), parseCssColor(header.theadBackground));
      log(`${theme} R10 contraste cabecera=${round(ratio)}`);
      expect.soft(ratio, 'R10 contraste de la cabecera').toBeGreaterThanOrEqual(MIN_CONTRAST);

      // Columna fijada por su menu: la celda de cabecera pasa a `bg-muted`; la del cuerpo, no.
      await page.getByTestId(`data-table-header-menu-${NAME_COLUMN_ID}`).click();
      await page.getByTestId(`data-table-pin-${NAME_COLUMN_ID}`).click();
      await expect(head).toHaveAttribute('data-pinned', /left|right/);
      await page.mouse.move(DESKTOP_VIEWPORT.width - 1, DESKTOP_VIEWPORT.height - 1);
      const pinned = await head.evaluate((th) => ({
        background: getComputedStyle(th).backgroundColor,
        color: getComputedStyle(th).color,
      }));
      const pinnedBody = await page
        .getByTestId(`data-table-cell-${NAME_COLUMN_ID}`)
        .first()
        .evaluate((td) => getComputedStyle(td).backgroundColor);
      log(`${theme} R10 fijada fondo=${pinned.background} texto=${pinned.color} cuerpo=${pinnedBody}`);
      expectColor(pinned.background, muted, 'R10 fondo de la cabecera fijada');
      expectColor(pinned.color, mutedForeground, 'R10 texto de la cabecera fijada');
      expectColor(pinnedBody, background, 'R10 celda fijada del cuerpo');
      await context.close();
    });

    test('R11 R13 la celda de fecha va en Plex Mono tabular; la de nombre y la cabecera, en Plex Sans', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { theme });
      await openCustomers(page);
      const mono = await tokenFont(page, '--font-mono');
      const sans = await tokenFont(page, '--font-sans');
      expect(mono, 'las fuentes mono y sans calculan igual').not.toBe(sans);

      const font = (testId: string) =>
        page
          .getByTestId(testId)
          .first()
          .evaluate((el) => ({
            family: getComputedStyle(el).fontFamily,
            numeric: getComputedStyle(el).fontVariantNumeric,
          }));
      const dateCell = await font(`data-table-cell-${DATE_COLUMN_ID}`);
      const nameCell = await font(`data-table-cell-${NAME_COLUMN_ID}`);
      const dateHead = await font(`data-table-head-${DATE_COLUMN_ID}`);
      log(`${theme} R11 fecha ${JSON.stringify(dateCell)} R13 nombre ${JSON.stringify(nameCell)} cabecera ${JSON.stringify(dateHead)}`);

      expect.soft(dateCell.family, 'R11 fuente de la celda de fecha').toBe(mono);
      expect.soft(dateCell.numeric, 'R11 cifras de la celda de fecha').toContain('tabular-nums');
      expect.soft(nameCell.family, 'R13 fuente de la celda de nombre').toBe(sans);
      expect.soft(nameCell.numeric, 'R13 cifras de la celda de nombre').not.toContain('tabular-nums');
      expect.soft(dateHead.family, 'R13 fuente de la cabecera de fecha').toBe(sans);
      expect.soft(dateHead.numeric, 'R13 cifras de la cabecera de fecha').not.toContain('tabular-nums');
      await context.close();
    });

    test('R15 R16 un item inactivo pinta --sidebar-muted-foreground con 4.5:1 y --sidebar-accent-foreground con hover', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { theme });
      await settleDesktop(page, false);
      const mutedForeground = await tokenColor(page, '--sidebar-muted-foreground');
      const accentForeground = await tokenColor(page, '--sidebar-accent-foreground');
      const sidebar = await tokenColor(page, '--sidebar');

      const inactiveSelector = `${CONTENT_BUTTONS}:not([data-active])`;
      const inactive = page.locator(inactiveSelector).first();
      const read = () =>
        inactive.evaluate(async (el) => {
          await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished));
          const svg = el.querySelector('svg');
          return {
            id: el.getAttribute('data-testid'),
            text: getComputedStyle(el).color,
            icon: svg ? getComputedStyle(svg).color : null,
          };
        });

      await page.mouse.move(DESKTOP_VIEWPORT.width - 1, DESKTOP_VIEWPORT.height - 1);
      const rest = await read();
      const ratio = contrastRatio(parseCssColor(rest.text), parseCssColor(sidebar));
      log(`${theme} R15 ${rest.id} reposo texto=${rest.text} icono=${rest.icon} contraste=${round(ratio)}`);
      expectColor(rest.text, mutedForeground, 'R15 texto del inactivo');
      if (rest.icon !== null) expectColor(rest.icon, mutedForeground, 'R15 icono del inactivo');
      expect.soft(ratio, 'R15 contraste contra --sidebar').toBeGreaterThanOrEqual(MIN_CONTRAST);

      await inactive.hover();
      const hovered = await read();
      log(`${theme} R16 ${hovered.id} hover texto=${hovered.text}`);
      expectColor(hovered.text, accentForeground, 'R16 texto con hover');
      await context.close();
    });

    test('R16 un item inactivo con foco por teclado pinta --sidebar-accent-foreground', async ({
      browser,
      baseURL,
      browserName,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { theme });
      await settleDesktop(page, false);
      const accentForeground = await tokenColor(page, '--sidebar-accent-foreground');
      const inactiveSelector = `${CONTENT_BUTTONS}:not([data-active])`;

      await page.mouse.move(DESKTOP_VIEWPORT.width - 1, DESKTOP_VIEWPORT.height - 1);
      if (browserName === 'webkit') {
        // El WebKit de Playwright no tabula enlaces (ni con Tab ni con Alt+Tab): tras una tecla,
        // el foco por programa queda en modo teclado y casa con `:focus-visible` (se comprueba).
        await page.keyboard.press('Shift');
        await page.locator(inactiveSelector).first().focus();
      } else {
        await tabTo(page, inactiveSelector, 'R16 foco');
      }
      const focused = await focusedStyle(page);
      const sidebarForeground = await tokenColor(page, '--sidebar-foreground');
      log(
        `${theme} R16 ${focused.id} foco texto=${focused.color} focus-visible=${focused.focusVisible} ` +
          `es --sidebar-foreground=${sameColor(focused.color, sidebarForeground)}`,
      );
      expect.soft(focused.focusVisible, 'R16 el foco por teclado no es :focus-visible').toBe(true);
      expectColor(focused.color, accentForeground, 'R16 texto con foco');
      await context.close();
    });

    for (const collapsed of [false, true]) {
      const mode = collapsed ? 'modo icono' : 'expandida';

      test(`R15 R16 un item con submenu pinta el tono apagado en reposo y el del hover con foco (${mode})`, async ({
        browser,
        baseURL,
      }) => {
        const { context, page } = await enter(browser, baseURL as string, { theme, collapsed });
        await settleDesktop(page, collapsed);
        const mutedForeground = await tokenColor(page, '--sidebar-muted-foreground');
        const accentForeground = await tokenColor(page, '--sidebar-accent-foreground');
        const sidebar = await tokenColor(page, '--sidebar');
        const trigger = page.getByTestId(FIRST_GROUP.testId);

        await page.mouse.move(DESKTOP_VIEWPORT.width - 1, DESKTOP_VIEWPORT.height - 1);
        const rest = await trigger.evaluate(async (el) => {
          await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished));
          const svg = el.querySelector('svg');
          return {
            slot: el.getAttribute('data-slot'),
            text: getComputedStyle(el).color,
            icon: svg ? getComputedStyle(svg).color : null,
          };
        });
        const ratio = contrastRatio(parseCssColor(rest.text), parseCssColor(sidebar));
        log(`${theme} ${mode} R15 ${FIRST_GROUP.testId} [${rest.slot}] reposo texto=${rest.text} icono=${rest.icon} contraste=${round(ratio)}`);
        expectColor(rest.text, mutedForeground, `R15 texto del grupo (${mode})`);
        if (rest.icon !== null) expectColor(rest.icon, mutedForeground, `R15 icono del grupo (${mode})`);
        expect.soft(ratio, 'R15 contraste contra --sidebar').toBeGreaterThanOrEqual(MIN_CONTRAST);

        await tabTo(page, `[data-testid="${FIRST_GROUP.testId}"]`, `R16 foco del grupo (${mode})`);
        const focused = await focusedStyle(page);
        log(`${theme} ${mode} R16 ${focused.id} foco texto=${focused.color} focus-visible=${focused.focusVisible}`);
        expect.soft(focused.focusVisible, 'R16 el foco por teclado no es :focus-visible').toBe(true);
        expectColor(focused.color, accentForeground, `R16 texto del grupo con foco (${mode})`);
        await context.close();
      });
    }

    test('R21 R23 R24 con el teclado: el boton pinta un contorno opaco de --ring de 2 px a 2 px; el campo, borde y anillo de 1 px', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await enter(browser, baseURL as string, { theme });
      await openCustomers(page);
      const ring = await tokenColor(page, '--ring');
      const input = await tokenColor(page, '--input');
      const card = await tokenColor(page, '--card');
      const background = await tokenColor(page, '--background');

      // R23: campo en reposo.
      const field = page.getByTestId(SEARCH_BOX_TESTID);
      const restField = await field.evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
        return {
          borderWidth: getComputedStyle(el).borderTopWidth,
          borderColor: getComputedStyle(el).borderTopColor,
        };
      });
      log(`${theme} R23 campo reposo borde=${restField.borderWidth} ${restField.borderColor}`);
      expect.soft(restField.borderWidth, 'R23 grosor del borde').toBe('1px');
      expectColor(restField.borderColor, input, 'R23 color del borde');
      for (const [name, surface] of [
        ['--card', card],
        ['--background', background],
      ] as const) {
        const ratio = controlContrast(restField.borderColor, [surface]);
        log(`${theme} R23 borde contra ${name}=${round(ratio)}`);
        expect.soft(ratio, `R23 borde contra ${name}`).toBeGreaterThanOrEqual(MIN_UI_CONTRAST);
      }

      // R24: campo con foco por teclado.
      await tabTo(page, `[data-testid="${SEARCH_BOX_TESTID}"]`, 'R24 campo');
      const focusedField = await focusedStyle(page);
      log(`${theme} R24 campo foco borde=${focusedField.borderColor} sombra=${focusedField.boxShadow} contorno=${focusedField.outlineStyle}`);
      expectColor(focusedField.borderColor, ring, 'R24 borde con foco');
      const rings = ringsOf(focusedField.boxShadow).filter((r) => parseCssColor(r.color).a > 0);
      expect.soft(rings.length, `R24 anillos visibles: ${focusedField.boxShadow}`).toBe(1);
      if (rings[0]) {
        expect.soft(rings[0].spread, 'R24 grosor del anillo').toBe('1px');
        expectColor(rings[0].color, ring, 'R24 color del anillo');
        expect.soft(parseCssColor(rings[0].color).a, 'R24 anillo opaco').toBe(1);
      }
      expect.soft(focusedField.outlineStyle, 'R24 sin contorno separado').toBe('none');

      // R21: el siguiente boton del contenido con foco por teclado.
      await tabTo(page, INSET_BUTTON, 'R21 boton');
      const focusedButton = await focusedStyle(page);
      log(`${theme} R21 boton "${focusedButton.label}" ${JSON.stringify(focusedButton)}`);
      expect.soft(focusedButton.focusVisible, 'R21 foco por teclado').toBe(true);
      expect.soft(focusedButton.outlineStyle, 'R21 estilo del contorno').toBe('solid');
      expect.soft(focusedButton.outlineWidth, 'R21 grosor del contorno').toBe('2px');
      expect.soft(focusedButton.outlineOffset, 'R21 separacion del contorno').toBe('2px');
      expectColor(focusedButton.outlineColor, ring, 'R21 color del contorno');
      expect.soft(parseCssColor(focusedButton.outlineColor).a, 'R21 contorno opaco').toBe(1);
      for (const [name, surface] of [
        ['--card', card],
        ['--background', background],
      ] as const) {
        const ratio = contrastRatio(parseCssColor(focusedButton.outlineColor), parseCssColor(surface));
        log(`${theme} R21 contorno contra ${name}=${round(ratio)}`);
        expect.soft(ratio, `R21 contorno contra ${name}`).toBeGreaterThanOrEqual(MIN_UI_CONTRAST);
      }
      await context.close();
    });
  });
}
