// QC-39 T1 — El bisturi: lo que esta ficha NO puede tocar del modulo `unidades`
// (`design.md > 1`, `> 12` riesgo 1).
//
// Cubre R3 (la ampliacion no cambia el tipo ni la proyeccion con los que otros modulos resuelven
// identificadores conocidos —`UnitCatalog.findRefs`—, ni anade, quita o modifica ningun caso de
// uso, puerto de escritura, esquema de entrada, error de dominio, comprobacion de permiso ni
// migracion) y R6 (la lista blanca de consulta del catalogo no se amplia).
//
// COMO SE COMPRUEBA: contra la RAMA BASE de la feature, con `git diff --name-only <base> --
// <rutas>`. El diff se hace contra el arbol de trabajo -no contra `HEAD`-, asi que una
// modificacion sin commitear tambien cae. Si el commit base no esta disponible en el repositorio
// donde corre la suite, el caso se SALTA de forma explicita y ruidosa con `ctx.skip(...)`, que
// es el criterio ya escrito en `unidades-convenciones.test.ts`: no pasa en silencio.
//
// La segunda mitad no depende de git: `UNIT_QUERYABLE` se afirma sobre la CONSTANTE IMPORTADA,
// que es lo que de verdad usan el caso de uso y la pantalla.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { UNIT_QUERYABLE } from '@/lib/modules/unidades';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). Mismo
 *  ayudante que `guard-rutas-privadas-cubiertas.test.ts`. Ojo: aqui la «raiz del repo» puede ser
 *  un WORKTREE (`.worktrees/<feature>/`), donde `.git` es un archivo y no una carpeta; los
 *  comandos de git funcionan igual porque comparten la base de objetos. */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

/**
 * La RAMA BASE de esta feature: `origin/dev` en el momento de montar el worktree
 * (`feature/QC-39-pantalla-de-unidades`). Es un commit, no una referencia movil, para que el
 * criterio no cambie por debajo si `origin/dev` avanza mientras la rama esta viva.
 */
const RAMA_BASE = '516e9c0';

/**
 * Los archivos INTOCABLES. No es una lista de «los que no hemos tocado»: es la lista de los que
 * `design.md > 1` declara fuera del bisturi. Los SEIS que esta ficha si puede tocar
 * -`domain/unit-view.ts`, `domain/list-units.ts`, `ports/unit-repository.ts`,
 * `adapters/driven/persistence/unit-prisma.ts`, `adapters/driving/unit-actions.ts` e `index.ts`-
 * NO estan aqui, y esa ausencia es la que hace util la lista.
 */
const INTOCABLES = [
  'lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts',
  'lib/modules/unidades/domain/create-unit.ts',
  'lib/modules/unidades/domain/update-unit.ts',
  'lib/modules/unidades/domain/delete-unit.ts',
  'lib/modules/unidades/domain/unit-input.ts',
  'lib/modules/unidades/domain/errors.ts',
  'lib/modules/unidades/domain/actor.ts',
  'lib/modules/unidades/domain/unit-queryable.ts',
  'lib/modules/unidades/domain/convert-quantity.ts',
  'db/schema.prisma',
];

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' });
}

/** `true` si el commit base esta disponible aqui; si no, los casos que dependen de el se saltan. */
function baseDisponible(): boolean {
  try {
    git(['rev-parse', '--verify', `${RAMA_BASE}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

describe('QC-39 no toca lo que no puede tocar (R3)', () => {
  it('ninguno de los archivos intocables del modulo cambia respecto a la rama base', (ctx) => {
    if (!baseDisponible()) {
      ctx.skip(`el commit base ${RAMA_BASE} no esta disponible: no se puede comparar el diff`);
      return;
    }

    const cambiados = git(['diff', '--name-only', RAMA_BASE, '--', ...INTOCABLES])
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea !== '');

    expect(cambiados, `QC-39 modifico archivos que R3 declara intocables: ${cambiados.join(', ')}`)
      .toEqual([]);
  });

  it('el detector muerde: comparando un archivo que SI cambio, el diff no sale vacio', (ctx) => {
    if (!baseDisponible()) {
      ctx.skip(`el commit base ${RAMA_BASE} no esta disponible: no se puede comparar el diff`);
      return;
    }

    // El caso simetrico, para que «lista vacia» no pueda serlo por vacuidad -por ejemplo porque
    // el `--` estuviera mal puesto y git no mirara nada-. `unit-prisma.ts` SI es de los seis que
    // esta ficha toca, asi que aqui tiene que aparecer.
    const cambiados = git([
      'diff',
      '--name-only',
      RAMA_BASE,
      '--',
      'lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts',
    ]);

    expect(cambiados).toContain('unit-prisma.ts');
  });

  it('`UnitRef` sigue teniendo exactamente tres campos: la ampliacion vive en `UnitView` (R3)', () => {
    // No basta con que `unit-catalog.ts` no cambie: lo que R3 protege es la FORMA del tipo que
    // otro modulo consume. Se afirma sobre la fuente, con el mismo criterio que
    // `module-contract.test.ts`.
    const fuente = readFileSync(
      join(repoRoot, 'lib', 'modules', 'unidades', 'domain', 'unit-catalog.ts'),
      'utf8',
    );
    const cuerpo = /export type UnitRef = \{([^}]*)\}/.exec(fuente)?.[1] ?? '';
    const campos = [...cuerpo.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);

    expect(campos).toEqual(['id', 'name', 'symbol']);
  });
});

describe('la lista blanca de consulta del catalogo no se amplia (R6)', () => {
  it('UNIT_QUERYABLE sigue siendo name/symbol/createdAt ordenables, sin filtros y con busqueda', () => {
    // Sobre la CONSTANTE IMPORTADA, no sobre el texto del archivo: es la que consumen el caso de
    // uso -`sanitizeListQuery`- y la pantalla, asi que es la que de verdad manda.
    expect(UNIT_QUERYABLE).toEqual({
      sortable: ['name', 'symbol', 'createdAt'],
      filterable: {},
      searchable: true,
    });
  });

  it('no hay ningun campo filtrable declarado: aqui no se filtra, y es a proposito', () => {
    expect(Object.keys(UNIT_QUERYABLE.filterable)).toEqual([]);
  });
});
