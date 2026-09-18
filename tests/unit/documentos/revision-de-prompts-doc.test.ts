// La forma de `docs/revision-de-prompts.md`: no hay test que llame a Gemini para comprobar la
// CALIDAD de un prompt (`[D5]`), asi que lo unico verificable por Vitest es que la PLANTILLA tiene
// las filas, los veredictos y la consecuencia aceptada que el registro promete.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const documento = readFileSync(join(repoRoot, 'docs', 'revision-de-prompts.md'), 'utf8');

const CAMPOS_CATALOGO = [
  'nombre',
  'presentación',
  'unidad',
  'precio',
  'compra mínima',
  'tiempo de entrega',
] as const;

const CAMPOS_FORMULA = [
  'nombre',
  'descripción',
  'materias primas (cantidad)',
  'materias primas (unidad)',
  'pasos y su orden',
] as const;

function escapado(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('docs/revision-de-prompts.md — plantilla del registro de revision humana', () => {
  it('R15 — trae una fila por cada uno de los seis campos de catalogo', () => {
    for (const campo of CAMPOS_CATALOGO) {
      expect(documento, `R15: falta la fila del campo '${campo}' de catalogo`).toMatch(
        new RegExp(`\\|\\s*${escapado(campo)}\\s*\\|`, 'i'),
      );
    }
  });

  it('R15 — trae una fila por cada uno de los cinco campos de formula', () => {
    for (const campo of CAMPOS_FORMULA) {
      expect(documento, `R15: falta la fila del campo '${campo}' de formula`).toMatch(
        new RegExp(`\\|\\s*${escapado(campo)}\\s*\\|`, 'i'),
      );
    }
  });

  it('R15 — son once filas de campo en total, seis de catalogo y cinco de formula', () => {
    expect(CAMPOS_CATALOGO.length + CAMPOS_FORMULA.length).toBe(11);
  });

  it('R15 — declara los tres veredictos literales: bien, mal, no estaba', () => {
    expect(documento).toMatch(/\bbien\b/);
    expect(documento).toMatch(/\bmal\b/);
    expect(documento).toMatch(/no estaba/);
  });

  it('R16 — deja escrita la frase de la consecuencia aceptada sobre no poder volver a comprobar un veredicto', () => {
    expect(documento).toMatch(/no se puede volver a comprobar/);
  });

  it('R16 — no hay ninguna columna de texto de prompt en la plantilla', () => {
    expect(documento).not.toMatch(/\|\s*(texto del prompt|prompt|contenido del prompt)\s*\|/i);
  });
});
