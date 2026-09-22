// El prompt provisional del recorte. Dominio puro: se lee el archivo del disco solo para afirmar
// su cabecera, sin llamar a ningun proveedor de IA.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CROP_COORDINATES_PROMPT } from '@/lib/modules/documentos/domain/crop-prompt';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ARCHIVO_PROMPT = join(repoRoot, 'lib', 'modules', 'documentos', 'domain', 'crop-prompt.ts');

describe('documentos — prompt de coordenadas del recorte (R18)', () => {
  it('R18 — el texto no esta vacio ni en blanco', () => {
    expect(CROP_COORDINATES_PROMPT.trim().length).toBeGreaterThan(0);
  });

  it('R18 — la cabecera del archivo declara que el texto es provisional', () => {
    const fuente = readFileSync(ARCHIVO_PROMPT, 'utf8');
    const cabecera = fuente.slice(0, fuente.indexOf('export'));
    expect(cabecera).toMatch(/provisional/i);
  });
});
