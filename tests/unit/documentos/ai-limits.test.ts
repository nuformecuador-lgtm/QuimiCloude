// El plazo de la lectura con IA: su valor y que viva en una sola definicion del modulo.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AI_READ_TIMEOUT_SECONDS,
  MAX_PDF_PAGES,
  PAGE_RENDER_DPI,
} from '@/lib/modules/documentos/domain/limits';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULO = join(repoRoot, 'lib', 'modules', 'documentos');
const LIMITS = join(MODULO, 'domain', 'limits.ts');

function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function fuentesDelModulo(dir: string = MODULO): readonly string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentesDelModulo(ruta);
    return ruta.endsWith('.ts') ? [ruta] : [];
  });
}

function relPosix(absPath: string): string {
  return relative(repoRoot, absPath).split(sep).join('/');
}

describe('documentos — el plazo de la lectura con IA', () => {
  it('R7: el plazo vale 60 segundos', () => {
    expect(AI_READ_TIMEOUT_SECONDS).toBe(60);
  });

  it('R7: el numero aparece una sola vez en el arbol del modulo, y los demas archivos lo importan', () => {
    const fuentes = fuentesDelModulo();
    expect(fuentes.length).toBeGreaterThan(0);

    const declarantes = fuentes.filter((ruta) =>
      /export const AI_READ_TIMEOUT_SECONDS\b/.test(stripComments(readFileSync(ruta, 'utf8'))),
    );
    expect(declarantes.map(relPosix)).toEqual(['lib/modules/documentos/domain/limits.ts']);

    // El VALOR tampoco se repite escrito a mano en otro archivo: se importa el nombre, no el numero.
    const otros = fuentes.filter((ruta) => ruta !== LIMITS);
    expect(otros.length).toBeGreaterThan(0);
    const intrusos = otros.filter((ruta) => /\b60_000\b|\b60\s*\*\s*1000\b/.test(stripComments(readFileSync(ruta, 'utf8'))));
    expect(intrusos.map(relPosix)).toEqual([]);
  });

  it('R5: MAX_PDF_PAGES y PAGE_RENDER_DPI siguen declarados una sola vez y sin duplicar en los archivos nuevos', () => {
    expect(MAX_PDF_PAGES).toBe(50);
    expect(PAGE_RENDER_DPI).toBe(150);

    const fuentes = fuentesDelModulo();
    for (const nombre of ['MAX_PDF_PAGES', 'PAGE_RENDER_DPI']) {
      const declarantes = fuentes.filter((ruta) =>
        new RegExp(`export const ${nombre}\\b`).test(stripComments(readFileSync(ruta, 'utf8'))),
      );
      expect(declarantes.map(relPosix), nombre).toEqual(['lib/modules/documentos/domain/limits.ts']);
    }

    const otros = fuentes.filter((ruta) => ruta !== LIMITS);
    for (const [nombre, patron] of [
      ['MAX_PDF_PAGES', /\b50\b/],
      ['PAGE_RENDER_DPI', /\b150\b/],
    ] as const) {
      const intrusos = otros.filter((ruta) => patron.test(stripComments(readFileSync(ruta, 'utf8'))));
      expect(intrusos.map(relPosix), `${nombre} repetido fuera de limits.ts`).toEqual([]);
    }
  });
});
