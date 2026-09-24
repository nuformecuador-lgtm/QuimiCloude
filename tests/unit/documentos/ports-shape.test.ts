// Cuantas operaciones declara cada puerto. Se lee el archivo del disco y se cuenta con un detector
// puro, sin importar el modulo ni tocar la red.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PORTS = join(repoRoot, 'lib', 'modules', 'documentos', 'ports');
const DOCUMENT_STORAGE = join(PORTS, 'document-storage.ts');
const CROP_STORAGE = join(PORTS, 'crop-storage.ts');

function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Las operaciones que declara una `interface` del archivo dado: el nombre de cada firma de metodo
 * dentro de su cuerpo, en el orden en que aparecen.
 */
function operacionesDe(fuente: string, interfaceName: string): readonly string[] {
  const sinComentarios = stripComments(fuente);
  const match = sinComentarios.match(new RegExp(`interface\\s+${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
  if (!match?.[1]) return [];
  return match[1]
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .flatMap((linea) => {
      const nombre = linea.match(/^(\w+)\s*\(/)?.[1];
      return nombre ? [nombre] : [];
    });
}

describe('documentos — forma de los puertos de almacenamiento (R13)', () => {
  it('el detector cuenta las operaciones de una interfaz inventada, incluida una infractora', () => {
    const fuenteInventada = `
      export interface CropStorage {
        upload(path: string, png: Uint8Array): Promise<void>;
        remove(path: string): Promise<void>;
      }
    `;
    // Prueba el detector contra una entrada QUE INFRINGE la regla de una sola operacion: si el
    // detector no la detectara, tampoco detectaria una infraccion real en el archivo de verdad.
    expect(operacionesDe(fuenteInventada, 'CropStorage')).toEqual(['upload', 'remove']);
  });

  it('R13 — `DocumentStorage` conserva EXACTAMENTE sus cuatro operaciones', () => {
    const fuente = readFileSync(DOCUMENT_STORAGE, 'utf8');
    expect(operacionesDe(fuente, 'DocumentStorage')).toEqual([
      'createSignedUpload',
      'createSignedReadUrl',
      'download',
      'remove',
    ]);
  });

  it('R13 — `CropStorage` declara UNA sola operacion', () => {
    const fuente = readFileSync(CROP_STORAGE, 'utf8');
    expect(operacionesDe(fuente, 'CropStorage')).toEqual(['upload']);
  });
});
