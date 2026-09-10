// QC-39 T1 — El bisturi: lo que esta ficha NO puede tocar del modulo `unidades`
// (`design.md > 1`, `> 12` riesgo 1).
//
// Cubre R3 (la ampliacion no cambia el tipo ni la proyeccion con los que otros modulos resuelven
// identificadores conocidos —`UnitCatalog.findRefs`—, ni anade, quita o modifica ningun caso de
// uso, puerto de escritura, esquema de entrada, error de dominio, comprobacion de permiso ni
// migracion) y R6 (la lista blanca de consulta del catalogo no se amplia).
//
// COMO SE COMPRUEBA: contra la BASE DE FUSION con `origin/dev`, calculada en cada ejecucion con
// `git merge-base origin/dev HEAD`, y con `git diff --name-only <base> -- <rutas>`. El diff se
// hace contra el arbol de trabajo -no contra `HEAD`-, asi que una modificacion sin commitear
// tambien cae. Si el rango no esta disponible (sin remoto, clon superficial), el caso se SALTA de
// forma explicita y ruidosa con `ctx.skip(...)`, diciendo que NO ha comprobado nada: mismo criterio
// que `unidades-convenciones.test.ts` y que `mergeBaseConDev()` en
// `tests/unit/navegacion/qc75-convenciones.test.ts`, de donde se copia el idioma.
//
// POR QUE MERGE-BASE Y NO UN COMMIT FIJADO A MANO. Hasta el 2026-09-08 la base era el literal
// `516e9c0` -la punta de `origin/dev` al montar el worktree-. Al mergear `origin/dev` en esta rama
// la comparacion empezo a atribuir a QC-39 cambios AJENOS que el merge trajo: `db/schema.prisma`,
// que modifico QC-65, salio senalado como «intocable modificado» por esta ficha. Era un falso
// positivo de la MEDICION, no una infraccion, y la lista de intocables no se toco por ello. La
// base de fusion mide solo lo que ESTA rama anade sobre el tronco, y sigue siendo correcta despues
// de cualquier merge futuro.
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

/**
 * La base de fusion entre `origin/dev` y la punta de esta rama, o `null` si el rango no esta
 * disponible aqui (sin remoto, clon superficial). Mismo helper que `mergeBaseConDev()` en
 * `tests/unit/navegacion/qc75-convenciones.test.ts`, incluido su manejo del caso sin rango:
 * devuelve `null` y quien lo llama SALTA en voz alta en vez de pasar en verde.
 */
function mergeBaseConDev(): string | null {
  try {
    return git(['merge-base', 'origin/dev', 'HEAD']).trim();
  } catch {
    return null;
  }
}

/** El texto del salto, para que los dos casos digan lo mismo: no han comprobado nada. */
const SIN_RANGO =
  'no se pudo calcular `git merge-base origin/dev HEAD` (sin remoto, o rango no disponible): ' +
  'este caso NO ha comprobado nada.';

/**
 * ESTA GUARDIA SOLO APLICA EN LA RAMA DE QC-39, y el 2026-09-09 hubo que decirlo.
 *
 * R3 es una regla sobre el ALCANCE de ESTA ficha —«la pantalla de unidades se hace sin tocar los
 * casos de uso, los errores ni el esquema»—, no una prohibicion general de que nadie en el repo
 * toque `domain/errors.ts`. El sujeto de la medicion es el diff `merge-base(origin/dev, HEAD)` con
 * el arbol, que en OTRA rama es el diff de OTRA feature: ahi los dos casos de abajo no miden a
 * QC-39, miden a un desconocido, y el veredicto no significa nada.
 *
 * Con QC-39 ya mergeada en `dev` el efecto fue doble y los dos rojos eran falsos:
 *   - `ninguno de los intocables cambia` senalaba `errors.ts`, `create-unit.ts`, `update-unit.ts`,
 *     `delete-unit.ts` y `convert-quantity.ts`, que toca QC-70 —el catalogo unico de errores— con
 *     permiso de su propio spec;
 *   - `el detector muerde` fallaba por lo contrario: `unit-prisma.ts` ya NO aparece en el diff,
 *     porque el cambio de QC-39 esta en el tronco y la base de fusion lo da por comun.
 * Ese segundo rojo es la prueba de que la medicion, fuera de su rama, no vale: el centinela de
 * vacuidad tampoco puede funcionar.
 *
 * Mismo remedio y mismo idioma que `unidades-convenciones.test.ts` (R32, R34) y que
 * `tests/unit/identity/account-status-scope.test.ts` (QC-65): fuera de su rama los casos quedan
 * MUDOS (`skipped`), nunca verdes —un verde diria «comprobado» sin haber mirado nada, el
 * anti-patron de la «validacion opcional» de `docs/verification.md`—, y el detector de rama se
 * ejercita aparte en los dos sentidos para que el salto no vacie la guardia.
 *
 * DOS SENALES, no una: el tipo que QC-39 CREA —`unit-view.ts`, ninguna rama implementa esta ficha
 * sin el— mas su carpeta de spec. Con una sola, cualquier rama que rozara el tipo se haria pasar
 * por QC-39.
 */
const ARCHIVO_CENTRAL_DE_QC39 = 'lib/modules/unidades/domain/unit-view.ts';
const CARPETA_SPEC_DE_QC39 = 'specs/QC-39-pantalla-de-unidades/';

/** Puro y exportado para poder ejercitarlo con listas sinteticas, en los dos sentidos. */
export function esLaRamaDeQC39(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC39) &&
    tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC_DE_QC39))
  );
}

/** Todo lo que esta rama anade sobre el tronco, en rutas de git. */
function tocadosDesde(base: string): readonly string[] {
  return git(['diff', '--name-only', base])
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea !== '');
}

/** La base de fusion, o `null` habiendo SALTADO ya en voz alta: sin rango o fuera de la rama. */
function baseDeQC39OMuda(ctx: { readonly skip: (nota: string) => void }): string | null {
  const base = mergeBaseConDev();
  if (base === null) {
    ctx.skip(SIN_RANGO);
    return null;
  }
  if (!esLaRamaDeQC39(tocadosDesde(base))) {
    ctx.skip(
      'el rango trae archivos pero no `' +
        ARCHIVO_CENTRAL_DE_QC39 +
        '` junto a `' +
        CARPETA_SPEC_DE_QC39 +
        '`: esta NO es la rama de QC-39, asi que su alcance no le aplica y este caso NO ha ' +
        'comprobado nada.',
    );
    return null;
  }
  return base;
}

/** El archivo que declara el contrato que otros modulos consumen. Ruta en formato git -barras-,
 *  porque se usa tanto en `git show` como -partida- en `join`. */
const UNIT_CATALOG = 'lib/modules/unidades/domain/unit-catalog.ts';

/** La declaracion de `UnitRef` tal cual esta escrita, desde `export type UnitRef = {` hasta el
 *  `};` que la cierra. Se compara TEXTO contra TEXTO -no una lista de campos- para que tambien
 *  muerda un cambio de tipo o de opcionalidad, no solo un campo de mas o de menos. */
function declaracionDeUnitRef(fuente: string): string {
  const desde = fuente.indexOf('export type UnitRef = {');
  if (desde === -1) return '';
  const hasta = fuente.indexOf('};', desde);
  if (hasta === -1) return '';
  return fuente.slice(desde, hasta + 2);
}

describe('QC-39 no toca lo que no puede tocar (R3)', () => {
  it('ninguno de los archivos intocables del modulo cambia respecto a la base de fusion', (ctx) => {
    const base = baseDeQC39OMuda(ctx);
    if (base === null) return;

    const cambiados = git(['diff', '--name-only', base, '--', ...INTOCABLES])
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea !== '');

    expect(cambiados, `QC-39 modifico archivos que R3 declara intocables: ${cambiados.join(', ')}`)
      .toEqual([]);
  });

  it('el detector muerde: comparando un archivo que SI cambio, el diff no sale vacio', (ctx) => {
    const base = baseDeQC39OMuda(ctx);
    if (base === null) return;

    // El caso simetrico, para que «lista vacia» no pueda serlo por vacuidad -por ejemplo porque
    // el `--` estuviera mal puesto y git no mirara nada-. `unit-prisma.ts` SI es de los seis que
    // esta ficha toca, asi que aqui tiene que aparecer.
    const cambiados = git([
      'diff',
      '--name-only',
      base,
      '--',
      'lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts',
    ]);

    expect(cambiados).toContain('unit-prisma.ts');
  });

  it('esta rama no toca la declaracion de `UnitRef`: la ampliacion vive en `UnitView` (R3)', (ctx) => {
    // R3 no dice «`UnitRef` tiene N campos»: dice que ESTA FICHA no cambia el tipo con el que
    // otro modulo resuelve identificadores conocidos. Son dos cosas distintas, y afirmar la
    // primera acusaba en falso en cuanto OTRA rama ensanchaba el tipo por su cuenta: al mergear
    // `origin/dev` llegaron `baseUnitId` y `factor` -QC-25/QC-83-, que QC-39 no puso. Asi que se
    // afirma sobre el CAMBIO: la declaracion de `UnitRef` en la base de fusion y la del arbol de
    // trabajo son la MISMA. Si esta ficha la tocara -un campo mas, uno menos, otro tipo-, esto
    // muerde; si la toco el tronco, no es asunto de QC-39.
    const base = mergeBaseConDev();
    if (base === null) {
      ctx.skip(SIN_RANGO);
      return;
    }

    const enLaBase = declaracionDeUnitRef(git(['show', `${base}:${UNIT_CATALOG}`]));
    const enElArbol = declaracionDeUnitRef(
      readFileSync(join(repoRoot, ...UNIT_CATALOG.split('/')), 'utf8'),
    );

    // Que no sea vacuo: si el extractor dejara de encontrar la declaracion, dos cadenas vacias
    // serian iguales y esto pasaria sin comprobar nada.
    expect(enElArbol, 'no se encontro la declaracion de `UnitRef` en el arbol de trabajo').toContain(
      'readonly id',
    );
    expect(enLaBase, 'no se encontro la declaracion de `UnitRef` en la base de fusion').toContain(
      'readonly id',
    );

    expect(
      enElArbol,
      'QC-39 modifico la declaracion de `UnitRef`, que R3 declara fuera de la ampliacion',
    ).toBe(enLaBase);
  });

  // Que el salto de arriba no vacie la guardia: una que se salta siempre no protege nada. El
  // detector de rama se ejercita con listas sinteticas en los DOS sentidos, sin depender de en
  // que rama corra el gate.
  it('y el detector de la rama de QC-39 MUERDE en los dos sentidos', () => {
    expect(
      esLaRamaDeQC39([
        ARCHIVO_CENTRAL_DE_QC39,
        'specs/QC-39-pantalla-de-unidades/requirements.md',
        'app/(private)/configuracion/unidades/page.tsx',
      ]),
    ).toBe(true);

    // El diff real de QC-70: toca el modulo `unidades` entero —incluidos sus errores— pero no
    // crea `unit-view.ts` ni trae la carpeta de spec de QC-39.
    expect(
      esLaRamaDeQC39([
        'lib/modules/unidades/domain/errors.ts',
        'lib/modules/errores/index.ts',
        'specs/QC-70-errores-centralizados/requirements.md',
      ]),
    ).toBe(false);
    // Una sola de las dos senales no basta, ni en un sentido ni en el otro.
    expect(esLaRamaDeQC39([ARCHIVO_CENTRAL_DE_QC39])).toBe(false);
    expect(esLaRamaDeQC39(['specs/QC-39-pantalla-de-unidades/design.md'])).toBe(false);
    expect(esLaRamaDeQC39([])).toBe(false);
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
