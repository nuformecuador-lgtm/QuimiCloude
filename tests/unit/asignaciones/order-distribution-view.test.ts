// tests/unit/asignaciones/order-distribution-view.test.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as asignaciones from '@/lib/modules/asignaciones';
import {
  distributionPresentationIds,
  toDistributionLines,
  unitLabelOf,
} from '@/lib/modules/asignaciones/domain/order-distribution-view';

const MODULE_ROOT = join(process.cwd(), 'lib', 'modules', 'asignaciones');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

const WRITE_VERB = '(?:create|update|set|save|replace|change|edit|add|remove|delete|clear)';
const DISTRIBUTION_NOUN = '(?:Presentation|Distribution|Unit)';
const WRITE_NAME = new RegExp(`^${WRITE_VERB}\\w*${DISTRIBUTION_NOUN}`, 'i');

describe('QC-170 — order-distribution-view: el reparto en solo lectura', () => {
  it('R26: conserva el orden de llegada de las lineas (el de alta) y resuelve cada nombre', () => {
    const names = new Map([
      ['p-1', 'Botella 1L'],
      ['p-2', 'Botella 200 ml'],
    ]);

    expect(
      toDistributionLines(
        [
          { presentationId: 'p-2', packages: 5 },
          { presentationId: 'p-1', packages: 1 },
        ],
        names,
      ),
    ).toEqual([
      { presentationId: 'p-2', presentationName: 'Botella 200 ml', packages: 5 },
      { presentationId: 'p-1', presentationName: 'Botella 1L', packages: 1 },
    ]);
  });

  it('R26: una presentacion que no vuelve del catalogo deja `presentationName: null` y no se descarta', () => {
    expect(toDistributionLines([{ presentationId: 'p-x', packages: 2 }], new Map())).toEqual([
      { presentationId: 'p-x', presentationName: null, packages: 2 },
    ]);
  });

  it('R27: sin lineas, el reparto es `[]`', () => {
    expect(toDistributionLines([], new Map())).toEqual([]);
  });

  it('R26: los ids de presentacion de toda la pagina salen unicos, para una sola llamada al catalogo', () => {
    expect(
      distributionPresentationIds([
        { presentationLines: [{ presentationId: 'p-1', packages: 1 }, { presentationId: 'p-2', packages: 2 }] },
        { presentationLines: [] },
        { presentationLines: [{ presentationId: 'p-1', packages: 3 }] },
      ]),
    ).toEqual(['p-1', 'p-2']);
  });

  it('R42: la etiqueta de la unidad es su simbolo, o su nombre si no lo tiene', () => {
    expect(unitLabelOf({ name: 'Litro', symbol: 'L' })).toBe('L');
    expect(unitLabelOf({ name: 'Garrafa', symbol: null })).toBe('Garrafa');
  });

  it('R12: el contrato de `asignaciones` no publica ninguna escritura del reparto ni de la unidad', () => {
    const offending = Object.keys(asignaciones).filter((name) => WRITE_NAME.test(name));
    expect(offending).toEqual([]);
  });

  it('R12: ningun archivo de `asignaciones` declara ni invoca una escritura del reparto o de la unidad', () => {
    const findings: string[] = [];
    const declared = new RegExp(`export\\s+(?:async\\s+)?function\\s+(${WRITE_VERB}\\w*${DISTRIBUTION_NOUN}\\w*)`, 'gi');
    const invoked = /\b(update\w*PresentationLines\w*|updateOrderDistribution\w*)\s*\(/g;
    for (const file of sourceFiles(MODULE_ROOT)) {
      const source = readFileSync(file, 'utf8');
      const rel = relative(process.cwd(), file);
      for (const match of source.matchAll(declared)) findings.push(`${rel}: declara ${match[1]}`);
      for (const match of source.matchAll(invoked)) findings.push(`${rel}: invoca ${match[1]}`);
    }
    expect(findings).toEqual([]);
  });
});
