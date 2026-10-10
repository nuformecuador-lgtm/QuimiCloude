// Contraste WCAG de los pares de color que pintan los componentes, medido sobre los tokens de
// `app/globals.css` en claro y en oscuro. Ningun valor de token se fija aqui: solo se mide.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  contrastRatio,
  extractColorBlocks,
  parseOklch,
  readToken,
  relativeLuminance,
} from '../theme/contraste';

const GLOBALS_CSS_PATH = fileURLToPath(new URL('../../../app/globals.css', import.meta.url));

const TEXTO = 4.5;
const INTERFAZ = 3;

type Par = readonly [primerPlano: string, fondo: string];

/** Luminancia relativa WCAG de un color hex de 6 cifras (las paradas del degradado van en hex). */
function luminanciaHex(hex: string): number {
  const lineal = (canal: number) =>
    canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [1, 3, 5].map((i) => lineal(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrasteDeLuminancias(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * `color-mix(in oklch, base, otro <proporcion>)` con las dos opacidades a 1: interpola L, C y el
 * tono por el arco corto, como manda CSS Color 4 por defecto.
 */
function mezclaOklch(base: string, otro: string, proporcionOtro: number): string {
  const a = parseOklch(base);
  const b = parseOklch(otro);
  let tonoA = a.h;
  let tonoB = b.h;
  if (tonoB - tonoA > 180) tonoA += 360;
  else if (tonoB - tonoA < -180) tonoB += 360;

  const p = proporcionOtro;
  const l = a.l * (1 - p) + b.l * p;
  const c = a.c * (1 - p) + b.c * p;
  const h = (((tonoA * (1 - p) + tonoB * p) % 360) + 360) % 360;
  return `oklch(${l.toFixed(6)} ${c.toFixed(6)} ${h.toFixed(6)})`;
}

/** Paradas hex de `--sidebar-panel-gradient` en el bloque `:root` o `.dark` que lo declara. */
function paradasDelPanel(css: string, selector: ':root' | '.dark'): string[] {
  const declaraciones = [
    ...css.matchAll(/(:root|\.dark)\s*\{\s*--sidebar-panel-gradient:\s*([^;]+);/g),
  ].filter((m) => m[1] === selector);
  expect(declaraciones).toHaveLength(1);
  return declaraciones[0][2].match(/#[0-9a-fA-F]{6}\b/g) ?? [];
}

function medir(bloque: string, [fg, bg]: Par): { par: string; ratio: number } {
  const ratio = contrastRatio(readToken(bloque, fg), readToken(bloque, bg));
  return { par: `${fg}/${bg}`, ratio: Number(ratio.toFixed(2)) };
}

function esperarMinimo(bloque: string, pares: readonly Par[], minimo: number): void {
  for (const par of pares) {
    const medida = medir(bloque, par);
    expect({ ...medida, ok: medida.ratio >= minimo }).toMatchObject({ par: medida.par, ok: true });
  }
}

describe('contraste de los componentes', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');
  const { light, dark } = extractColorBlocks(css);
  const modos = [
    ['claro', light, ':root'],
    ['oscuro', dark, '.dark'],
  ] as const;

  it.each(modos)('R2: en modo %s cada tono de badge llega a 4.5:1 entre texto y fondo', (_m, bloque) => {
    esperarMinimo(
      bloque,
      [
        ['success-text', 'success-subtle'],
        ['warning-text', 'warning-subtle'],
        ['destructive-text', 'destructive-subtle'],
        ['info-text', 'info-subtle'],
        ['muted-foreground', 'muted'],
      ],
      TEXTO,
    );
  });

  it.each(modos)('R10: en modo %s el texto de la cabecera de tabla llega a 4.5:1 sobre --muted', (_m, bloque) => {
    esperarMinimo(bloque, [['muted-foreground', 'muted']], TEXTO);
  });

  it.each(modos)(
    'R15: en modo %s el item inactivo llega a 4.5:1 contra --sidebar y contra cada parada del degradado del panel',
    (_m, bloque, selector) => {
      esperarMinimo(bloque, [['sidebar-muted-foreground', 'sidebar']], TEXTO);

      const texto = relativeLuminance(readToken(bloque, 'sidebar-muted-foreground'));
      const paradas = paradasDelPanel(css, selector);
      expect(paradas.length).toBeGreaterThanOrEqual(2);
      for (const parada of paradas) {
        const ratio = Number(contrasteDeLuminancias(texto, luminanciaHex(parada)).toFixed(2));
        expect({ parada, ratio, ok: ratio >= TEXTO }).toMatchObject({ parada, ok: true });
      }
    },
  );

  it.each(modos)('R18: en modo %s el texto del boton primario llega a 4.5:1 sobre --primary', (_m, bloque) => {
    esperarMinimo(bloque, [['primary-foreground', 'primary']], TEXTO);
  });

  it.each(modos)('R19: en modo %s la variante secondary llega a 4.5:1', (_m, bloque) => {
    esperarMinimo(bloque, [['secondary-foreground', 'secondary']], TEXTO);
  });

  it.each(modos)(
    'R20: en modo %s el boton destructivo llega a 4.5:1 en reposo y con el fondo mezclado con un 10 % de --foreground',
    (_m, bloque) => {
      esperarMinimo(bloque, [['destructive-foreground', 'destructive']], TEXTO);

      const texto = readToken(bloque, 'destructive-foreground');
      const reposo = contrastRatio(texto, readToken(bloque, 'destructive'));
      const hover = mezclaOklch(readToken(bloque, 'destructive'), readToken(bloque, 'foreground'), 0.1);
      const ratio = Number(contrastRatio(texto, hover).toFixed(2));
      expect({ hover, ratio, ok: ratio >= TEXTO }).toMatchObject({ hover, ok: true });
      // Mezclar con --foreground aleja el fondo del texto: el hover no baja del reposo.
      expect(contrastRatio(texto, hover)).toBeGreaterThanOrEqual(reposo);
    },
  );

  it.each(modos)('R21: en modo %s el anillo de foco llega a 3:1 contra --card y contra --background', (_m, bloque) => {
    esperarMinimo(
      bloque,
      [
        ['ring', 'card'],
        ['ring', 'background'],
      ],
      INTERFAZ,
    );
  });

  it.each(modos)('R23: en modo %s el borde de los campos llega a 3:1 contra --card y contra --background', (_m, bloque) => {
    esperarMinimo(
      bloque,
      [
        ['input', 'card'],
        ['input', 'background'],
      ],
      INTERFAZ,
    );
  });
});
