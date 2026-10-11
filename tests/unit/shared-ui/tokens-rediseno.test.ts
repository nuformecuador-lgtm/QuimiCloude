import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const globalsCss = readFileSync(join(raiz, 'app', 'globals.css'), 'utf8');
const qcCss = readFileSync(join(raiz, 'docs', 'diseno', 'canvas', 'qc.css'), 'utf8');

type Declaraciones = Map<string, string>;

function declaracionesDe(cuerpo: string, destino: Declaraciones, primeraGana: boolean): void {
  const sinComentarios = cuerpo.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const trozo of sinComentarios.split(';')) {
    const coincidencia = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(trozo);
    if (coincidencia === null) continue;
    if (primeraGana && destino.has(coincidencia[1])) continue;
    destino.set(coincidencia[1], coincidencia[2].replace(/\s+/g, ' '));
  }
}

/** Junta las declaraciones de todos los bloques de primer nivel con ese selector exacto. */
function bloques(css: string, selector: string, primeraGana = false): Declaraciones {
  const destino: Declaraciones = new Map();
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patron = new RegExp(`(?:^|\\n)${escapado}\\s*\\{([^}]*)\\}`, 'g');
  for (const coincidencia of css.matchAll(patron)) declaracionesDe(coincidencia[1], destino, primeraGana);
  return destino;
}

const claro = bloques(globalsCss, ':root');
const oscuro = bloques(globalsCss, '.dark');
const tema = bloques(globalsCss, '@theme inline');

// En qc.css `--d-b` es a la vez el borde de peligro y una duración declarada más abajo; el
// valor de color es el primero.
const qcClaro = bloques(qcCss, '.qc', true);
const qcOscuro = bloques(qcCss, '.qc.dk,.qc .dk', true);

function normaliza(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim();
}

function delCanvas(mapa: Declaraciones, nombre: string): string {
  const valor = mapa.get(nombre);
  if (valor === undefined) throw new Error(`qc.css no declara ${nombre}`);
  return normaliza(valor);
}

/** El sexto color de avatar no es variable en el canvas: vive en la regla `.av.c6`. */
function avatarSeis(oscuroDelCanvas: boolean): { fondo: string; texto: string } {
  const selector = oscuroDelCanvas ? '\\.dk \\.av\\.c6,\\.qc\\.dk \\.av\\.c6' : '\\.av\\.c6';
  const coincidencia = new RegExp(`(?:^|\\n)${selector}\\{background:([^;]+);color:([^}]+)\\}`).exec(
    qcCss,
  );
  if (coincidencia === null) throw new Error('qc.css no declara .av.c6');
  return { fondo: normaliza(coincidencia[1]), texto: normaliza(coincidencia[2]) };
}

/** Token de `globals.css` y la variable de `qc.css` de la que copia su valor. */
const DEL_CANVAS: ReadonlyArray<readonly [string, string]> = [
  ['--status-neutral-subtle', '--n-bg'],
  ['--status-neutral-text', '--n-fg'],
  ['--status-neutral-dot', '--n-dot'],
  ['--status-progress-subtle', '--p-bg'],
  ['--status-progress-text', '--p-fg'],
  ['--status-progress-dot', '--p-dot'],
  ['--success-border', '--s-b'],
  ['--warning-border', '--w-b'],
  ['--destructive-border', '--d-b'],
  ['--info-border', '--i-b'],
  ['--avatar-1', '--av1'],
  ['--avatar-1-text', '--av1-fg'],
  ['--avatar-2', '--av2'],
  ['--avatar-2-text', '--av2-fg'],
  ['--avatar-3', '--av3'],
  ['--avatar-3-text', '--av3-fg'],
  ['--avatar-4', '--av4'],
  ['--avatar-4-text', '--av4-fg'],
  ['--avatar-5', '--av5'],
  ['--avatar-5-text', '--av5-fg'],
];

const TODOS = [...DEL_CANVAS.map(([token]) => token), '--avatar-6', '--avatar-6-text'];

describe('tokens del rediseño en globals.css', () => {
  it('R6 R15 R41 — cada token nuevo está en el tema claro con el valor de qc.css', () => {
    for (const [token, delQc] of DEL_CANVAS) {
      expect(claro.get(token), token).toBe(delCanvas(qcClaro, delQc));
    }
    const seis = avatarSeis(false);
    expect(claro.get('--avatar-6')).toBe(seis.fondo);
    expect(claro.get('--avatar-6-text')).toBe(seis.texto);
  });

  it('R6 R15 R41 — cada token nuevo está en el tema oscuro con el valor de qc.css', () => {
    for (const [token, delQc] of DEL_CANVAS) {
      expect(oscuro.get(token), token).toBe(delCanvas(qcOscuro, delQc));
    }
    const seis = avatarSeis(true);
    expect(oscuro.get('--avatar-6')).toBe(seis.fondo);
    expect(oscuro.get('--avatar-6-text')).toBe(seis.texto);
  });

  it('R6 R15 R41 — todos van en oklch', () => {
    for (const token of TODOS) {
      expect(claro.get(token), token).toMatch(/^oklch\(/);
      expect(oscuro.get(token), token).toMatch(/^oklch\(/);
    }
  });

  it('R6 R15 R41 — cada token tiene su utilidad --color-* en @theme inline', () => {
    for (const token of TODOS) {
      const utilidad = `--color-${token.slice(2)}`;
      expect(tema.get(utilidad), utilidad).toBe(`var(${token})`);
    }
  });

  it('R6 — los puntos de waiting, success, danger e info reutilizan tokens con el valor del canvas', () => {
    const puntos: ReadonlyArray<readonly [string, string]> = [
      ['--warning', '--w-dot'],
      ['--success', '--s-dot'],
      ['--destructive', '--d-dot'],
      ['--info', '--i-dot'],
    ];
    for (const [token, delQc] of puntos) {
      expect(claro.get(token), token).toBe(delCanvas(qcClaro, delQc));
      expect(oscuro.get(token), token).toBe(delCanvas(qcOscuro, delQc));
    }
  });

  it('R8 — declara @keyframes status-pulse sobre el punto de progreso', () => {
    const coincidencia = /@keyframes status-pulse\s*\{([\s\S]*?)\n\}/.exec(globalsCss);
    expect(coincidencia).not.toBeNull();
    expect(coincidencia?.[1]).toContain('var(--status-progress-dot)');
  });
});
