// T2 — Test de contrato de los 26 tokens de color de `app/globals.css` (R1-R6, R25).
// Parsea el CSS como texto (mismo patron que los tests de `schema.prisma`): no importa el
// archivo como modulo (no lo es), lo lee y compara contra la tabla esperada de
// `design-input-tokens.md > 3`, copiada aqui literalmente.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GLOBALS_CSS_PATH = fileURLToPath(new URL('../../../app/globals.css', import.meta.url));

function readGlobalsCss(): string {
  return readFileSync(GLOBALS_CSS_PATH, 'utf8');
}

/**
 * Extrae el bloque de tokens de color de `:root` (claro) y el primero de `.dark` (oscuro).
 * `globals.css` declara un SEGUNDO `:root` / `.dark` mas abajo (T13) solo con
 * `--sidebar-panel-gradient`, que no es uno de los 26 tokens de color: por eso se recorta el
 * texto ANTES de que aparezca ese segundo `:root`, para no mezclar los dos pares de bloques.
 */
function extractColorBlocks(css: string): { light: string; dark: string } {
  const rootStart = css.indexOf(':root {');
  const darkStart = css.indexOf('.dark {', rootStart);
  const secondRootStart = css.indexOf(':root {', darkStart);

  if (rootStart === -1 || darkStart === -1 || secondRootStart === -1) {
    throw new Error('No se encontraron los bloques :root / .dark esperados en globals.css');
  }

  return {
    light: css.slice(rootStart, darkStart),
    dark: css.slice(darkStart, secondRootStart),
  };
}

function readToken(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Token --${name} no encontrado en el bloque`);
  return match[1].trim();
}

const TOKEN_NAMES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
] as const;

const CHART_TOKEN_NAMES = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const;

// Tabla esperada, copiada literalmente de `design-input-tokens.md > 3.1` y `> 3.2`.
const EXPECTED_LIGHT: Record<(typeof TOKEN_NAMES)[number], string> = {
  background: 'oklch(0.967 0.009 188.1)',
  foreground: 'oklch(0.262 0.031 202.3)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.262 0.031 202.3)',
  popover: 'oklch(1 0 0)',
  'popover-foreground': 'oklch(0.262 0.031 202.3)',
  primary: 'oklch(0.623 0.137 50.5)',
  'primary-foreground': 'oklch(1 0 0)',
  secondary: 'oklch(0.967 0.012 184.1)',
  'secondary-foreground': 'oklch(0.286 0.036 192.4)',
  muted: 'oklch(0.940 0.017 187.9)',
  'muted-foreground': 'oklch(0.679 0.041 198.3)',
  accent: 'oklch(0.757 0.089 184.4 / 16%)',
  'accent-foreground': 'oklch(0.262 0.031 202.3)',
  destructive: 'oklch(0.560 0.165 33.8)',
  border: 'oklch(0.613 0.063 197 / 16%)',
  input: 'oklch(0.613 0.063 197 / 16%)',
  ring: 'oklch(0.613 0.063 197)',
  sidebar: 'oklch(1 0 0)',
  'sidebar-foreground': 'oklch(0.482 0.044 197.9)',
  'sidebar-primary': 'oklch(0.623 0.137 50.5)',
  'sidebar-primary-foreground': 'oklch(1 0 0)',
  'sidebar-accent': 'oklch(0.757 0.089 184.4 / 16%)',
  'sidebar-accent-foreground': 'oklch(0.262 0.031 202.3)',
  'sidebar-border': 'oklch(0.613 0.063 197 / 16%)',
  'sidebar-ring': 'oklch(0.613 0.063 197)',
};

const EXPECTED_DARK: Record<(typeof TOKEN_NAMES)[number], string> = {
  background: 'oklch(0.194 0.018 209.1)',
  foreground: 'oklch(0.963 0.018 188.4)',
  card: 'oklch(0.288 0.032 192.3)',
  'card-foreground': 'oklch(0.981 0.010 189.1)',
  popover: 'oklch(0.288 0.032 192.3)',
  'popover-foreground': 'oklch(0.981 0.010 189.1)',
  primary: 'oklch(0.750 0.167 50.5)',
  'primary-foreground': 'oklch(0.222 0.022 205.9)',
  secondary: 'oklch(0.288 0.035 201.4)',
  'secondary-foreground': 'oklch(0.963 0.018 188.4)',
  muted: 'oklch(0.244 0.027 203.6)',
  'muted-foreground': 'oklch(0.644 0.045 199.9)',
  accent: 'oklch(0.757 0.089 184.4 / 12%)',
  'accent-foreground': 'oklch(0.981 0.010 189.1)',
  destructive: 'oklch(0.831 0.095 32.0)',
  border: 'oklch(0.858 0.054 191.8 / 10%)',
  input: 'oklch(0.858 0.054 191.8 / 10%)',
  ring: 'oklch(0.757 0.089 184.4)',
  sidebar: 'oklch(0.241 0.025 204.3)',
  'sidebar-foreground': 'oklch(0.817 0.036 194.3)',
  'sidebar-primary': 'oklch(0.750 0.167 50.5)',
  'sidebar-primary-foreground': 'oklch(0.222 0.022 205.9)',
  'sidebar-accent': 'oklch(0.757 0.089 184.4 / 9%)',
  'sidebar-accent-foreground': 'oklch(1 0 0)',
  'sidebar-border': 'oklch(0.858 0.054 191.8 / 10%)',
  'sidebar-ring': 'oklch(0.757 0.089 184.4)',
};

// Los --chart-* son los grises que dejo `shadcn init`: R6 exige que sigan intactos.
const EXPECTED_CHART: Record<(typeof CHART_TOKEN_NAMES)[number], string> = {
  'chart-1': 'oklch(0.87 0 0)',
  'chart-2': 'oklch(0.556 0 0)',
  'chart-3': 'oklch(0.439 0 0)',
  'chart-4': 'oklch(0.371 0 0)',
  'chart-5': 'oklch(0.269 0 0)',
};

// --- oklch -> sRGB lineal y contraste WCAG. Va SOLO en el test (design.md > 9): production
// no necesita convertir nada, los tokens ya son oklch. ---

function parseOklch(value: string): { l: number; c: number; h: number } {
  const match = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!match) throw new Error(`Valor oklch no reconocido: ${value}`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

/** Devuelve r,g,b en sRGB LINEAL (0..1, sin codificar gamma) — justo lo que pide la formula
 * de luminancia relativa de WCAG, asi que no hace falta un paso extra de gamma. */
function oklchToLinearSrgb(value: string): { r: number; g: number; b: number } {
  const { l, c, h } = parseOklch(value);
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const lCubed = l_ ** 3;
  const mCubed = m_ ** 3;
  const sCubed = s_ ** 3;

  const r = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  const g = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  const b2 = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.7076147010 * sCubed;

  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return { r: clamp(r), g: clamp(g), b: clamp(b2) };
}

function relativeLuminance(value: string): number {
  const { r, g, b } = oklchToLinearSrgb(value);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('color-tokens', () => {
  const css = readGlobalsCss();
  const { light, dark } = extractColorBlocks(css);

  it('define los 26 tokens del modo claro con los valores del diseno', () => {
    for (const name of TOKEN_NAMES) {
      expect(readToken(light, name)).toBe(EXPECTED_LIGHT[name]);
    }
  });

  it('define los 26 tokens del modo oscuro con los valores del diseno', () => {
    for (const name of TOKEN_NAMES) {
      expect(readToken(dark, name)).toBe(EXPECTED_DARK[name]);
    }
  });

  it('no deja ningun color acromatico heredado de shadcn init', () => {
    // Acromatico heredado = croma 0 con luminosidad distinta de 1 (R3). oklch(1 0 0) es
    // blanco puro del diseno y esta permitido. Se comprueban los 26 tokens de color en los
    // dos modos; los --chart-* quedan fuera a proposito (R6, cubierto en su propio test).
    for (const block of [light, dark]) {
      for (const name of TOKEN_NAMES) {
        const value = readToken(block, name);
        const { l, c } = parseOklch(value);
        const isAchromaticLeftover = c === 0 && l !== 1;
        expect(isAchromaticLeftover).toBe(false);
      }
    }
  });

  it('usa el mismo hue de acento en los dos modos y solo cambia la luminosidad', () => {
    const lightPrimary = parseOklch(readToken(light, 'primary'));
    const darkPrimary = parseOklch(readToken(dark, 'primary'));
    const lightSidebarPrimary = parseOklch(readToken(light, 'sidebar-primary'));
    const darkSidebarPrimary = parseOklch(readToken(dark, 'sidebar-primary'));

    expect(lightPrimary.h).toBe(50.5);
    expect(darkPrimary.h).toBe(50.5);
    expect(lightSidebarPrimary.h).toBe(50.5);
    expect(darkSidebarPrimary.h).toBe(50.5);

    expect(lightPrimary.l).toBe(0.623);
    expect(darkPrimary.l).toBe(0.75);
    expect(lightSidebarPrimary.l).toBe(0.623);
    expect(darkSidebarPrimary.l).toBe(0.75);
  });

  it('mantiene --radius en 0.625rem', () => {
    const match = css.match(/--radius:\s*([^;]+);/);
    expect(match?.[1].trim()).toBe('0.625rem');
  });

  it('no modifica los cinco tokens --chart-*', () => {
    for (const block of [light, dark]) {
      for (const name of CHART_TOKEN_NAMES) {
        expect(readToken(block, name)).toBe(EXPECTED_CHART[name]);
      }
    }
  });

  it('alcanza 4.5:1 de contraste en foreground/background y sidebar-foreground/sidebar', () => {
    // D10 cerro `--primary` / `--primary-foreground` en 3,75:1 A PROPOSITO: un boton es
    // componente de UI (AA exige 3:1, no 4.5:1), y ese par NO se assertea aqui. No es un
    // olvido, esta escrito en `requirements.md > R25` y `design.md > 9`.
    const lightForegroundBg = contrastRatio(
      readToken(light, 'foreground'),
      readToken(light, 'background'),
    );
    const darkForegroundBg = contrastRatio(
      readToken(dark, 'foreground'),
      readToken(dark, 'background'),
    );
    const lightSidebar = contrastRatio(
      readToken(light, 'sidebar-foreground'),
      readToken(light, 'sidebar'),
    );
    const darkSidebar = contrastRatio(
      readToken(dark, 'sidebar-foreground'),
      readToken(dark, 'sidebar'),
    );

    expect(lightForegroundBg).toBeGreaterThanOrEqual(4.5);
    expect(darkForegroundBg).toBeGreaterThanOrEqual(4.5);
    expect(lightSidebar).toBeGreaterThanOrEqual(4.5);
    expect(darkSidebar).toBeGreaterThanOrEqual(4.5);
  });
});
