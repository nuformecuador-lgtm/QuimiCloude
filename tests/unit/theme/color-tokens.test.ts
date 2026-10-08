// Contrato de los tokens de `app/globals.css` (QC-226 R1-R6, R32). Lee el CSS como texto y lo
// compara con las tablas esperadas, copiadas literalmente del `tokens.css` del kit de marca.
//
// ENMIENDA QC-226 (D2, D3, D14, D16): este archivo cubria QC-29 R1-R6 y R25 con la paleta
// agua/naranja. Cada caso de QC-29 sigue aqui con su equivalente: tablas de valores (R1, R2),
// sin acromaticos heredados, hue y luminosidad del acento, radio (R4), `--chart-*` y contraste
// (R5, ahora con los 15 pares de la guia).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GLOBALS_CSS_PATH = fileURLToPath(new URL('../../../app/globals.css', import.meta.url));

function readGlobalsCss(): string {
  return readFileSync(GLOBALS_CSS_PATH, 'utf8');
}

/** El primer `:root` y el primer `.dark` del archivo son los de los tokens de color. */
function extractColorBlocks(css: string): { light: string; dark: string } {
  const rootStart = css.indexOf(':root {');
  const darkStart = css.indexOf('.dark {', rootStart);

  if (rootStart === -1 || darkStart === -1) {
    throw new Error('No se encontraron los bloques :root / .dark esperados en globals.css');
  }

  return {
    light: css.slice(rootStart, css.indexOf('}', rootStart)),
    dark: css.slice(darkStart, css.indexOf('}', darkStart)),
  };
}

function extractThemeInline(css: string): string {
  const start = css.indexOf('@theme inline {');
  if (start === -1) throw new Error('No se encontro @theme inline en globals.css');
  return css.slice(start, css.indexOf('}', start));
}

function readToken(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Token --${name} no encontrado en el bloque`);
  return match[1].trim();
}

/** Quita el bloque del login (de su delimitador INICIO a su FIN) y los comentarios. */
function cssOutsideLoginBlock(css: string): string {
  const inicio = css.search(/\/\*\s*══[^*]*pantalla de login — INICIO/i);
  const finMatch = /\/\*\s*══[^*]*pantalla de login — FIN[^*]*\*\//i.exec(css);
  const sinLogin =
    inicio === -1 || !finMatch
      ? css
      : css.slice(0, inicio) + css.slice(finMatch.index + finMatch[0].length);
  return sinLogin.replace(/\/\*[\s\S]*?\*\//g, '');
}

const SHADCN_TOKEN_NAMES = [
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

const STATUS_TOKEN_NAMES = [
  'destructive-foreground',
  'success',
  'success-foreground',
  'success-subtle',
  'success-text',
  'warning',
  'warning-foreground',
  'warning-subtle',
  'warning-text',
  'destructive-subtle',
  'destructive-text',
  'info',
  'info-foreground',
  'info-subtle',
  'info-text',
  'sidebar-muted-foreground',
] as const;

const ALL_TOKEN_NAMES = [...SHADCN_TOKEN_NAMES, ...CHART_TOKEN_NAMES, ...STATUS_TOKEN_NAMES] as const;

type TokenName = (typeof ALL_TOKEN_NAMES)[number];

// Copiada literalmente del `:root` de `tokens.css` (kit de marca v1).
const EXPECTED_LIGHT: Record<TokenName, string> = {
  background: 'oklch(0.985 0.004 215)',
  foreground: 'oklch(0.15 0.01 215)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.15 0.01 215)',
  popover: 'oklch(1 0 0)',
  'popover-foreground': 'oklch(0.15 0.01 215)',
  primary: 'oklch(0.44 0.076 188)',
  'primary-foreground': 'oklch(1 0 0)',
  secondary: 'oklch(0.94 0.025 250)',
  'secondary-foreground': 'oklch(0.3 0.06 250)',
  muted: 'oklch(0.965 0.006 215)',
  'muted-foreground': 'oklch(0.45 0.013 215)',
  accent: 'oklch(0.95 0.025 248)',
  'accent-foreground': 'oklch(0.32 0.075 248)',
  destructive: 'oklch(0.55 0.21 27)',
  border: 'oklch(0.925 0.009 215)',
  input: 'oklch(0.65 0.013 215)',
  ring: 'oklch(0.44 0.076 188)',
  'chart-1': 'oklch(0.44 0.076 188)',
  'chart-2': 'oklch(0.54 0.16 255)',
  'chart-3': 'oklch(0.6 0.12 90)',
  'chart-4': 'oklch(0.65 0.16 0)',
  'chart-5': 'oklch(0.36 0.12 300)',
  sidebar: 'oklch(0.25 0.044 195)',
  'sidebar-foreground': 'oklch(0.95 0.012 195)',
  'sidebar-primary': 'oklch(0.8 0.108 245)',
  'sidebar-primary-foreground': 'oklch(0.15 0.01 215)',
  'sidebar-accent': 'oklch(0.34 0.058 195)',
  'sidebar-accent-foreground': 'oklch(0.98 0.008 195)',
  'sidebar-border': 'oklch(0.33 0.05 195)',
  'sidebar-ring': 'oklch(0.8 0.108 245)',
  'destructive-foreground': 'oklch(1 0 0)',
  success: 'oklch(0.52 0.14 145)',
  'success-foreground': 'oklch(1 0 0)',
  'success-subtle': 'oklch(0.95 0.04 145)',
  'success-text': 'oklch(0.42 0.11 145)',
  warning: 'oklch(0.64 0.15 60)',
  'warning-foreground': 'oklch(0.15 0.01 215)',
  'warning-subtle': 'oklch(0.95 0.031 60)',
  'warning-text': 'oklch(0.42 0.099 60)',
  'destructive-subtle': 'oklch(0.95 0.024 27)',
  'destructive-text': 'oklch(0.42 0.11 27)',
  info: 'oklch(0.53 0.13 285)',
  'info-foreground': 'oklch(1 0 0)',
  'info-subtle': 'oklch(0.95 0.024 285)',
  'info-text': 'oklch(0.42 0.11 285)',
  'sidebar-muted-foreground': 'oklch(0.78 0.03 195)',
};

// Copiada literalmente del `.dark` de `tokens.css` (kit de marca v1).
const EXPECTED_DARK: Record<TokenName, string> = {
  background: 'oklch(0.15 0.01 215)',
  foreground: 'oklch(0.985 0.004 215)',
  card: 'oklch(0.21 0.012 215)',
  'card-foreground': 'oklch(0.985 0.004 215)',
  popover: 'oklch(0.21 0.012 215)',
  'popover-foreground': 'oklch(0.985 0.004 215)',
  primary: 'oklch(0.77 0.115 186)',
  'primary-foreground': 'oklch(0.15 0.01 215)',
  secondary: 'oklch(0.3 0.035 250)',
  'secondary-foreground': 'oklch(0.93 0.025 250)',
  muted: 'oklch(0.27 0.013 215)',
  'muted-foreground': 'oklch(0.65 0.013 215)',
  accent: 'oklch(0.31 0.055 248)',
  'accent-foreground': 'oklch(0.93 0.035 248)',
  destructive: 'oklch(0.75 0.15 27)',
  border: 'oklch(0.27 0.013 215)',
  input: 'oklch(0.55 0.013 215)',
  ring: 'oklch(0.77 0.115 186)',
  'chart-1': 'oklch(0.72 0.115 186)',
  'chart-2': 'oklch(0.58 0.12 270)',
  'chart-3': 'oklch(0.88 0.16 105)',
  'chart-4': 'oklch(0.58 0.12 60)',
  'chart-5': 'oklch(0.88 0.108 210)',
  sidebar: 'oklch(0.18 0.025 195)',
  'sidebar-foreground': 'oklch(0.95 0.012 195)',
  'sidebar-primary': 'oklch(0.8 0.108 245)',
  'sidebar-primary-foreground': 'oklch(0.15 0.01 215)',
  'sidebar-accent': 'oklch(0.28 0.04 195)',
  'sidebar-accent-foreground': 'oklch(0.98 0.008 195)',
  'sidebar-border': 'oklch(0.27 0.03 195)',
  'sidebar-ring': 'oklch(0.8 0.108 245)',
  'destructive-foreground': 'oklch(0.15 0.01 215)',
  success: 'oklch(0.75 0.15 145)',
  'success-foreground': 'oklch(0.15 0.01 215)',
  'success-subtle': 'oklch(0.29 0.055 145)',
  'success-text': 'oklch(0.87 0.1 145)',
  warning: 'oklch(0.75 0.15 60)',
  'warning-foreground': 'oklch(0.15 0.01 215)',
  'warning-subtle': 'oklch(0.29 0.055 60)',
  'warning-text': 'oklch(0.87 0.086 60)',
  'destructive-subtle': 'oklch(0.29 0.055 27)',
  'destructive-text': 'oklch(0.87 0.069 27)',
  info: 'oklch(0.75 0.134 285)',
  'info-foreground': 'oklch(0.15 0.01 215)',
  'info-subtle': 'oklch(0.29 0.055 285)',
  'info-text': 'oklch(0.87 0.066 285)',
  'sidebar-muted-foreground': 'oklch(0.72 0.025 195)',
};

const TEXT_PAIRS: ReadonlyArray<readonly [TokenName, TokenName]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['primary', 'card'],
  ['secondary-foreground', 'secondary'],
  ['destructive-foreground', 'destructive'],
  ['success-text', 'success-subtle'],
  ['warning-text', 'warning-subtle'],
  ['destructive-text', 'destructive-subtle'],
  ['info-text', 'info-subtle'],
  // D22: QC-29 R25 sigue vigente, el texto de la barra lateral cumple AA sobre su fondo.
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-muted-foreground', 'sidebar'],
];

const UI_PAIRS: ReadonlyArray<readonly [TokenName, TokenName]> = [
  ['input', 'card'],
  ['ring', 'card'],
];

// --- oklch -> sRGB lineal y contraste WCAG. Vive solo en el test: produccion no convierte. ---

function parseOklch(value: string): { l: number; c: number; h: number } {
  const match = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!match) throw new Error(`Valor oklch no reconocido: ${value}`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

/** r,g,b en sRGB lineal (0..1): justo lo que pide la luminancia relativa de WCAG. */
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
  const modes = [
    ['claro', light],
    ['oscuro', dark],
  ] as const;

  it('R1 (ENMIENDA QC-226): declara en :root los tokens del modo claro con los valores de tokens.css', () => {
    for (const name of ALL_TOKEN_NAMES) {
      expect({ name, value: readToken(light, name) }).toEqual({ name, value: EXPECTED_LIGHT[name] });
    }
  });

  it('R2 (ENMIENDA QC-226): declara en .dark los mismos tokens con los valores de tokens.css', () => {
    for (const name of ALL_TOKEN_NAMES) {
      expect({ name, value: readToken(dark, name) }).toEqual({ name, value: EXPECTED_DARK[name] });
    }
  });

  it('R1, R2 (ENMIENDA QC-226): declara los --chart-* de la paleta y no los grises de shadcn init', () => {
    for (const [, block] of modes) {
      for (const name of CHART_TOKEN_NAMES) {
        expect(parseOklch(readToken(block, name)).c).toBeGreaterThan(0);
      }
    }
  });

  it('R1, R2: no deja ningun color acromatico heredado de shadcn init', () => {
    // Acromatico heredado = croma 0 con luminosidad distinta de 1: oklch(1 0 0) es el blanco
    // de la paleta y esta permitido.
    for (const [, block] of modes) {
      for (const name of SHADCN_TOKEN_NAMES) {
        const { l, c } = parseOklch(readToken(block, name));
        expect({ name, isAchromaticLeftover: c === 0 && l !== 1 }).toEqual({
          name,
          isAchromaticLeftover: false,
        });
      }
    }
  });

  it('R1, R2 (ENMIENDA QC-226): el primario es petroleo y el acento de la barra es azul en los dos modos', () => {
    const lightPrimary = parseOklch(readToken(light, 'primary'));
    const darkPrimary = parseOklch(readToken(dark, 'primary'));
    const lightSidebarPrimary = parseOklch(readToken(light, 'sidebar-primary'));
    const darkSidebarPrimary = parseOklch(readToken(dark, 'sidebar-primary'));

    expect(lightPrimary).toEqual({ l: 0.44, c: 0.076, h: 188 });
    expect(darkPrimary).toEqual({ l: 0.77, c: 0.115, h: 186 });
    expect(lightSidebarPrimary).toEqual({ l: 0.8, c: 0.108, h: 245 });
    expect(darkSidebarPrimary).toEqual(lightSidebarPrimary);
  });

  it('R3: expone cada token de estado y --sidebar-muted-foreground como color de Tailwind en @theme inline', () => {
    const theme = extractThemeInline(css);
    for (const name of STATUS_TOKEN_NAMES) {
      expect(theme).toContain(`--color-${name}: var(--${name});`);
    }
    expect(css.match(/@theme inline\s*\{/g)).toHaveLength(1);
  });

  it('R4 (ENMIENDA QC-226): declara --radius en 0.5rem', () => {
    const declarations = [...css.matchAll(/--radius:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(declarations).toEqual(['0.5rem']);
  });

  it.each(modes)(
    'R5 (ENMIENDA QC-226): en modo %s los pares de texto llegan a 4.5:1 y los de interfaz a 3:1',
    (_mode, block) => {
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrastRatio(readToken(block, fg), readToken(block, bg));
        expect({ pair: `${fg}/${bg}`, ok: ratio >= 4.5, ratio }).toMatchObject({ ok: true });
      }
      for (const [fg, bg] of UI_PAIRS) {
        const ratio = contrastRatio(readToken(block, fg), readToken(block, bg));
        expect({ pair: `${fg}/${bg}`, ok: ratio >= 3, ratio }).toMatchObject({ ok: true });
      }
    },
  );

  it('R6: declara en :root los tokens de duracion y de curva', () => {
    const expected: Record<string, string> = {
      'dur-instant': '100ms',
      'dur-fast': '150ms',
      'dur-base': '200ms',
      'dur-slow': '300ms',
      'ease-standard': 'cubic-bezier(0.2, 0, 0, 1)',
      'ease-enter': 'cubic-bezier(0, 0, 0.2, 1)',
      'ease-exit': 'cubic-bezier(0.4, 0, 1, 1)',
    };
    const motionRootStart = css.lastIndexOf(':root {', css.indexOf('--dur-instant'));
    expect(motionRootStart).toBeGreaterThan(-1);
    const motionRoot = css.slice(motionRootStart, css.indexOf('}', motionRootStart));
    for (const [name, value] of Object.entries(expected)) {
      expect({ name, value: readToken(motionRoot, name) }).toEqual({ name, value });
    }
  });

  it('R32: no declara movimiento fuera del bloque del login ni la regla global de movimiento reducido', () => {
    expect(css).not.toMatch(/animation-duration:\s*0\.01ms/);
    expect(css).not.toMatch(/transition-duration:\s*0\.01ms/);
    expect(css).not.toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after/);

    const outside = cssOutsideLoginBlock(css);
    expect(outside).not.toMatch(/prefers-reduced-motion/);
    expect(outside).not.toMatch(/@keyframes/);
    expect(outside).not.toMatch(/(^|[\s;{])animation(-[a-z-]+)?\s*:/m);
    expect(outside).not.toMatch(/(^|[\s;{])transition(-[a-z-]+)?\s*:/m);
  });
});
