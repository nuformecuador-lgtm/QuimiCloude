// Alcance del logger: donde puede vivir `pino` y quien puede ver `lib/shared`.
//
// `docs/architecture.md > La regla de dependencias`: `lib/shared/**` solo importa
// paquetes npm y otro `shared`; el dominio y los puertos de un modulo NUNCA importan
// `lib/shared/**` ni `pino` —reciben puertos y `lib/composition` cablea.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');

function fuentesDe(dir: string): string[] {
  const rutas: string[] = [];
  const pasear = (actual: string): void => {
    for (const entrada of readdirSync(actual)) {
      const ruta = join(actual, entrada);
      if (statSync(ruta).isDirectory()) {
        pasear(ruta);
      } else if (/\.tsx?$/.test(entrada)) {
        rutas.push(ruta);
      }
    }
  };
  pasear(dir);
  return rutas;
}

describe('alcance del logger', () => {
  it('el dominio y los puertos de documentos no importan lib/shared ni pino', () => {
    // Se miran las SENTENCIAS de importacion, no la prosa: los docblocks nombran
    // `lib/shared` al explicar la regla, y eso no es una dependencia.
    const patron = /from\s+['"][^'"]*lib\/shared|from\s+['"]pino['"]|require\(\s*['"]pino['"]\s*\)/;
    const hallazgos: string[] = [];
    for (const ruta of [
      ...fuentesDe(join(repoRoot, 'lib', 'modules', 'documentos', 'domain')),
      ...fuentesDe(join(repoRoot, 'lib', 'modules', 'documentos', 'ports')),
    ]) {
      const fuente = readFileSync(ruta, 'utf8');
      if (patron.test(fuente)) hallazgos.push(ruta);
    }

    expect(hallazgos).toEqual([]);
  });

  it('lib/shared no importa modulos ni composition', () => {
    // Igual: solo sentencias de importacion. Los docblocks citan `lib/modules` y
    // `lib/composition` al documentar la regla.
    const patron = /from\s+['"][^'"]*lib\/(modules|composition)/;
    const hallazgos: string[] = [];
    for (const ruta of fuentesDe(join(repoRoot, 'lib', 'shared'))) {
      const fuente = readFileSync(ruta, 'utf8');
      if (patron.test(fuente)) hallazgos.push(ruta);
    }

    expect(hallazgos).toEqual([]);
  });
});
