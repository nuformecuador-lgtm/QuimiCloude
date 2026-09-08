// QC-76 T9 — El AMBITO en el `where` del listado de unidades (`design.md > 4.2`).
//
// Cubre R17 (los dos modos traen las de la empresa MAS las de sistema, y el `total` de la pagina
// cuenta solo lo visible) y R18 (la condicion se define UNA sola vez y ninguna consulta del
// listado se construye sin la empresa).
//
// HONESTIDAD: este archivo NO toca Postgres. El cliente Prisma esta sustituido por un DOBLE que
// captura los argumentos —mismo patron que `tests/unit/recetas/recipe-catalog.test.ts`—, asi que
// lo que se prueba aqui es la FORMA de la consulta que sale del adaptador, no lo que Postgres
// devuelve. Que con esa consulta cada empresa vea exactamente lo suyo mas lo de sistema es de
// `tests/integration/unidades/unit-repository.int.test.ts`, contra la base real.

import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Prisma } from '@prisma/client';

/** Doble del cliente Prisma: captura `where` y devuelve filas fijas. */
const findMany = vi.fn(async () => [] as unknown[]);
const count = vi.fn(async () => 0);
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { unit: { findMany, count } } }));

const { buildUnitWhere, companyScopeWhere, listUnits, listUnitsPage } = await import(
  '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma'
);

import type { ListQuery } from '@/lib/modules/unidades/domain/list-query';
import type { UnitScope } from '@/lib/modules/unidades/domain/unit-scope';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const SCOPE: UnitScope = { companyId: EMPRESA };

/** Consulta vacia ya saneada: sin orden, sin filtros y sin busqueda. */
const SIN_CONSULTA: ListQuery = { page: 1, sort: null, filters: {}, search: '' };

/** La condicion de ambito tal y como tiene que salir: empresa **o** sistema (`company_id` NULO,
 *  R11). Se escribe aqui a mano a proposito: si el adaptador la cambia, este archivo lo dice. */
const OR_ESPERADO = [{ companyId: EMPRESA }, { companyId: null }];

/** Argumento de la ultima llamada al doble. */
function ultimoArgumento(espia: typeof findMany | typeof count): { where?: unknown } {
  const ultima = espia.mock.calls.at(-1);
  if (ultima === undefined) throw new Error('el doble de Prisma no fue invocado');
  return (ultima as unknown as [{ where?: unknown }])[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('companyScopeWhere — la UNICA definicion del ambito (R18)', () => {
  it('es el OR de la empresa y las de sistema, y «de sistema» es company_id NULO', () => {
    expect(companyScopeWhere(SCOPE)).toEqual({ OR: OR_ESPERADO });
  });

  it('no inventa ninguna otra condicion: la marca de «de sistema» es la ausencia de empresa', () => {
    // R12: no hay columna `system` que mirar. Si alguien anadiera aqui un `system: true` o un
    // filtro de vida que la tabla no tiene, este aserto de igualdad estricta caeria.
    const where = companyScopeWhere({ companyId: 'otra-empresa' });
    expect(Object.keys(where)).toEqual(['OR']);
    expect(where.OR).toEqual([{ companyId: 'otra-empresa' }, { companyId: null }]);
  });
});

describe('buildUnitWhere — todo `where` del listado se compone del ambito (R17, R18)', () => {
  it('sin busqueda, el `where` es exactamente la condicion de ambito', () => {
    expect(buildUnitWhere(SIN_CONSULTA, SCOPE)).toEqual({ OR: OR_ESPERADO });
  });

  it('con busqueda, el ambito y el termino se combinan con AND: buscar no amplia lo visible', () => {
    // El caso que importa: `OR` y `nameNormalized` al mismo nivel harian que un termino de
    // busqueda ensenara unidades de otra empresa. Por eso van dentro de un `AND`.
    const where = buildUnitWhere({ ...SIN_CONSULTA, search: 'Litro' }, SCOPE) as {
      AND?: readonly unknown[];
    };

    expect(where.AND).toBeDefined();
    expect(where.AND?.[0]).toEqual({ OR: OR_ESPERADO });
    expect(JSON.stringify(where.AND?.[1])).toContain('nameNormalized');
    // Y el ambito NO queda al nivel de arriba, que es donde un `OR` no acota nada.
    expect((where as { OR?: unknown }).OR).toBeUndefined();
  });

  it('la busqueda sigue yendo NORMALIZADA contra name_normalized, como antes del ambito', () => {
    // R21: el ambito se anade, la busqueda no cambia. `MILI-LITRO` normaliza a `mililitro`.
    const where = buildUnitWhere({ ...SIN_CONSULTA, search: 'MILI-LITRO' }, SCOPE);
    expect(JSON.stringify(where)).toContain('mililitro');
  });
});

describe('los dos modos del listado llevan el ambito hasta Prisma (R17)', () => {
  it('el catalogo entero consulta con el `where` acotado y conserva su cota', async () => {
    await listUnits(200, SIN_CONSULTA, SCOPE);

    const argumento = ultimoArgumento(findMany) as { where?: unknown; take?: number };
    expect(argumento.where).toEqual({ OR: OR_ESPERADO });
    // La cota de R40 (QC-32) sigue intacta: el ambito no la sustituye.
    expect(argumento.take).toBe(200);
  });

  it('la pagina consulta con el `where` acotado y con la ventana pedida', async () => {
    await listUnitsPage({ ...SIN_CONSULTA, page: 2, pageSize: 10 }, SCOPE);

    const argumento = ultimoArgumento(findMany) as {
      where?: unknown;
      skip?: number;
      take?: number;
    };
    expect(argumento.where).toEqual({ OR: OR_ESPERADO });
    expect(argumento.skip).toBe(10);
    expect(argumento.take).toBe(10);
  });

  it('el `count` de la pagina usa el MISMO objeto `where` que el `findMany` (R17)', async () => {
    // No «uno equivalente»: el MISMO. Es lo que garantiza que el `total` cuente solo lo visible
    // para la empresa —un `count` con su propio `where` contaria tambien las unidades ajenas y
    // la paginacion mentiria—, y `toBe` es lo que hace imposible que diverjan sin caer aqui.
    await listUnitsPage({ ...SIN_CONSULTA, search: 'litro' }, SCOPE);

    const whereDelFindMany = ultimoArgumento(findMany).where;
    const whereDelCount = ultimoArgumento(count).where;

    expect(whereDelCount).toBe(whereDelFindMany);
    expect(JSON.stringify(whereDelCount)).toContain(EMPRESA);
  });
});

// ---------------------------------------------------------------------------------------
// R18, la mitad estructural: la condicion se escribe UNA sola vez en todo el modulo.
// ---------------------------------------------------------------------------------------

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

/** Fuente SIN comentarios: se vigila el CODIGO, no la prosa. Mismo ayudante —y misma razon—
 *  que `tests/unit/unidades/module-contract.test.ts`: el JSDoc de `companyScopeWhere` explica
 *  la condicion en palabras, y un barrido sobre el texto crudo leeria la explicacion como una
 *  segunda definicion. */
function leerFuente(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const unidadesDir = join(repoRoot, 'lib', 'modules', 'unidades');
const adaptador = join(unidadesDir, 'adapters', 'driven', 'persistence', 'unit-prisma.ts');

function toPosix(file: string): string {
  return file.split(sep).join('/');
}

describe('R18 — la condicion de ambito se define en un solo sitio', () => {
  it('`companyId: null` solo aparece en `companyScopeWhere`, y una sola vez', () => {
    const fuente = leerFuente(readFileSync(adaptador, 'utf8'));
    const apariciones = [...fuente.matchAll(/companyId:\s*null/g)];
    expect(
      apariciones,
      'el OR de «empresa o sistema» esta escrito mas de una vez en el adaptador',
    ).toHaveLength(1);

    // Y esta dentro del cuerpo de `companyScopeWhere`, no suelto en otra consulta.
    const cuerpo = /export function companyScopeWhere\([\s\S]*?\n\}/.exec(fuente)?.[0] ?? '';
    expect(cuerpo).toMatch(/companyId:\s*null/);

    // `buildUnitWhere` COMPONE, no reescribe: no vuelve a nombrar el `OR`.
    const buildBody = /export function buildUnitWhere\([\s\S]*?\n\}/.exec(fuente)?.[0] ?? '';
    expect(buildBody).toMatch(/companyScopeWhere\(scope\)/);
    expect(buildBody, '`buildUnitWhere` escribe su propio OR en vez de componer').not.toMatch(
      /OR:/,
    );
  });

  it('`buildUnitWhere` EXIGE el ambito en su firma: una consulta que lo olvide no compila', () => {
    // La mitad de R18 que vive en el `typecheck`, escrita aqui como requisito para que no
    // dependa de que alguien se acuerde de mirar la firma.
    const fuente = leerFuente(readFileSync(adaptador, 'utf8'));
    expect(fuente).toMatch(
      /export function buildUnitWhere\(\s*query: ListQuery,\s*scope: UnitScope,?\s*\)/,
    );
    // Y el tipo del ambito no admite ausencia: `scope?:` o `UnitScope | null` volverian a
    // permitir la consulta sin empresa.
    expect(fuente).not.toMatch(/scope\?:/);
    expect(fuente).not.toMatch(/scope: UnitScope \| null/);
  });

  it('el archivo vigilado es el adaptador de unidades, no otro', () => {
    // Un fichero mal apuntado dejaria los tres casos de arriba verdes por vacuidad.
    expect(toPosix(relative(repoRoot, adaptador))).toBe(
      'lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts',
    );
    expect(readFileSync(adaptador, 'utf8')).toContain('export function companyScopeWhere');
  });
});

/** El tipo `Prisma` se importa para que el archivo hable el mismo lenguaje que el adaptador; se
 *  usa aqui para dejar constancia de que el `where` construido ES un `UnitWhereInput`. */
const _tipado: Prisma.UnitWhereInput = companyScopeWhere(SCOPE);
void _tipado;
