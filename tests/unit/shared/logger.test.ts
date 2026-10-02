// El logger general del servidor (`lib/shared/observability/logger.ts`).
//
// Lo que aqui se prueba es el contrato propio, no el de la libreria: que cada modulo
// obtiene un logger con los tres niveles, que llamarlos no lanza, y que el objeto
// cumple ESTRUCTURALMENTE el puerto que el dominio espera (asi `lib/composition`
// cablea `forModule('documentos')` sin adaptador intermedio). La emision JSON a
// stdout es trabajo de `pino` y no se re-testea aqui.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { forModule } from '@/lib/shared/observability/logger';

import type { DocumentJobLog } from '@/lib/modules/documentos/ports/document-job-log';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');

describe('logger general', () => {
  it('expone info, warn y error invocables sin lanzar', () => {
    const log = forModule('prueba');

    expect(() => log.info('hola', { n: 1 })).not.toThrow();
    expect(() => log.warn('cuidado', { n: 2 })).not.toThrow();
    expect(() => log.error('fallo', { n: 3 })).not.toThrow();
  });

  it('cumple el puerto DocumentJobLog sin adaptador (estructural)', () => {
    // Si el puerto exigiera otra forma, esta asignacion no compilaria y el archivo
    // fallaria a typechequear: es el candado de que `lib/composition` puede cablear
    // `forModule('documentos')` directo.
    const log: DocumentJobLog = forModule('documentos');

    expect(() => log.info('paso', { fileId: 'a' })).not.toThrow();
    expect(() => log.warn('aviso', { fileId: 'a' })).not.toThrow();
    expect(() => log.error('grave', { fileId: 'a' })).not.toThrow();
  });

  it('solo logger.ts importa pino en todo lib/', () => {
    // `pino` aislada en un solo archivo (`docs/dependencias.md > pino`): si algun
    // modulo la importa directo, cae aqui.
    const hallazgos: string[] = [];
    const pasear = (dir: string): void => {
      for (const entrada of readdirSync(dir)) {
        const ruta = join(dir, entrada);
        if (statSync(ruta).isDirectory()) {
          if (entrada === 'node_modules') continue;
          pasear(ruta);
        } else if (/\.tsx?$/.test(entrada)) {
          const fuente = readFileSync(ruta, 'utf8');
          if (/from\s+['"]pino['"]|require\(\s*['"]pino['"]\s*\)/.test(fuente)) {
            hallazgos.push(ruta);
          }
        }
      }
    };
    pasear(join(repoRoot, 'lib'));

    expect(hallazgos).toEqual([join(repoRoot, 'lib', 'shared', 'observability', 'logger.ts')]);
  });
});
