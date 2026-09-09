// QC-39 T1 — La PROYECCION del listado de unidades (`design.md > 2.1`, `> 2.2`).
//
// Cubre R1 (la vista trae ademas `baseUnitId`, `factor` como TEXTO decimal y `isSystem`; base
// -> los dos ausentes, derivada -> los dos presentes) y R2 (el ambito viaja DERIVADO: el
// identificador de empresa entra en el `select` pero NO sale hacia la interfaz).
//
// HONESTIDAD: este archivo NO toca Postgres. El cliente Prisma esta sustituido por un DOBLE que
// devuelve filas fijas y captura los argumentos, mismo patron que `unit-prisma-where.test.ts`.
// Lo que se prueba aqui es la PROYECCION -que se pide, que sale y que NO sale-, no lo que
// Postgres devuelve.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Doble del cliente Prisma: devuelve las filas que le pongan y captura el `select`. */
const findMany = vi.fn(async () => [] as unknown[]);
const count = vi.fn(async () => 0);
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { unit: { findMany, count } } }));

const { listUnits, listUnitsPage } = await import(
  '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma'
);

import type { ListQuery } from '@/lib/modules/unidades/domain/list-query';
import type { UnitScope } from '@/lib/modules/unidades/domain/unit-scope';
import type { UnitView } from '@/lib/modules/unidades/domain/unit-view';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). Mismo
 *  ayudante que `module-contract.test.ts`, replicado a proposito. */
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

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const SCOPE: UnitScope = { companyId: EMPRESA };
const SIN_CONSULTA: ListQuery = { page: 1, sort: null, filters: {}, search: '' };

/** Los SEIS campos de `UnitView`, escritos a mano: si la proyeccion gana o pierde uno, cae. */
const CAMPOS_DE_LA_VISTA = ['id', 'name', 'symbol', 'baseUnitId', 'factor', 'isSystem'];

/** Las SEIS columnas que el `select` tiene que pedir: las cinco que salen mas `companyId`. */
const COLUMNAS_DEL_SELECT = ['id', 'name', 'symbol', 'baseUnitId', 'factor', 'companyId'];

/**
 * Doble del `Decimal` que Prisma devuelve para `factor`. Se usa un objeto con `toString` en vez
 * del `Decimal` real a proposito: asi el caso afirma que el adaptador entrega el texto TAL CUAL
 * lo da la columna -sin recortar ceros, sin redondear y sin pasar por `Number`-, que es
 * exactamente lo que R1 exige. Quitar los ceros de relleno es de quien lo pinta, no de aqui.
 */
function decimalDeLaColumna(texto: string): unknown {
  return { toString: () => texto };
}

/** Fila cruda tal y como la devolveria Prisma con `UNIT_SELECT`, incluida la empresa. */
const FILA_DE_SISTEMA_BASE = {
  id: 'unit-kg',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  companyId: null,
};

const FILA_DE_EMPRESA_DERIVADA = {
  id: 'unit-saco',
  name: 'Saco',
  symbol: null,
  baseUnitId: 'unit-kg',
  factor: decimalDeLaColumna('25.0000'),
  companyId: EMPRESA,
};

/** El `select` con el que se llamo a Prisma en la ultima consulta. */
function selectDeLaUltimaConsulta(): Record<string, unknown> {
  const ultima = findMany.mock.calls.at(-1);
  if (ultima === undefined) throw new Error('el doble de Prisma no fue invocado');
  return (ultima as unknown as [{ select: Record<string, unknown> }])[0].select;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UNIT_SELECT — que se le pide a la base (R1, R2)', () => {
  it('pide los tres campos de siempre MAS baseUnitId, factor y companyId, y ninguno mas', async () => {
    await listUnits(200, SIN_CONSULTA, SCOPE);

    // Igualdad ESTRICTA de claves: una columna de mas -`nameNormalized`, `createdAt`,
    // `updatedAt`- pondria este caso rojo, que es justo lo que R16 de la pantalla vigila desde
    // el otro lado.
    expect([...Object.keys(selectDeLaUltimaConsulta())].sort()).toEqual(
      [...COLUMNAS_DEL_SELECT].sort(),
    );
  });

  it('la consulta paginada pide EXACTAMENTE la misma proyeccion', async () => {
    await listUnitsPage(SIN_CONSULTA, SCOPE);

    expect([...Object.keys(selectDeLaUltimaConsulta())].sort()).toEqual(
      [...COLUMNAS_DEL_SELECT].sort(),
    );
  });
});

describe('toUnitView — que sale hacia la interfaz (R1, R2)', () => {
  it('la vista tiene los SEIS campos y ninguno mas: el identificador de empresa NO sale', async () => {
    findMany.mockResolvedValueOnce([FILA_DE_SISTEMA_BASE, FILA_DE_EMPRESA_DERIVADA]);

    const vistas = await listUnits(200, SIN_CONSULTA, SCOPE);

    expect(vistas).toHaveLength(2);
    for (const vista of vistas) {
      expect([...Object.keys(vista)].sort()).toEqual([...CAMPOS_DE_LA_VISTA].sort());
      // R2 en negativo, y por el nombre exacto de la clave: nada que permita saber de que
      // empresa es la unidad cruza la frontera.
      expect(Object.prototype.hasOwnProperty.call(vista, 'companyId')).toBe(false);
    }
  });

  it('una unidad de SISTEMA sale con isSystem true y una de empresa con false (R2)', async () => {
    findMany.mockResolvedValueOnce([FILA_DE_SISTEMA_BASE, FILA_DE_EMPRESA_DERIVADA]);

    const [sistema, deEmpresa] = await listUnits(200, SIN_CONSULTA, SCOPE);

    // «De sistema» es exactamente `company_id` NULO: no hay bandera que mirar, y esa sigue
    // siendo la UNICA definicion del modulo.
    expect(sistema?.isSystem).toBe(true);
    expect(deEmpresa?.isSystem).toBe(false);
  });

  it('una unidad BASE sale con baseUnitId y factor AMBOS null (R1)', async () => {
    findMany.mockResolvedValueOnce([FILA_DE_SISTEMA_BASE]);

    const [base] = await listUnits(200, SIN_CONSULTA, SCOPE);

    const esperada: UnitView = {
      id: 'unit-kg',
      name: 'Kilogramo',
      symbol: 'kg',
      baseUnitId: null,
      factor: null,
      isSystem: true,
    };
    expect(base).toEqual(esperada);
  });

  it('una unidad DERIVADA sale con los dos presentes y el factor como TEXTO, sin tocarlo (R1)', async () => {
    findMany.mockResolvedValueOnce([FILA_DE_EMPRESA_DERIVADA]);

    const [derivada] = await listUnits(200, SIN_CONSULTA, SCOPE);

    expect(derivada?.baseUnitId).toBe('unit-kg');
    expect(typeof derivada?.factor).toBe('string');
    // El texto llega VERBATIM: ni se recortan los ceros de relleno ni se convierte a numero.
    expect(derivada?.factor).toBe('25.0000');
  });

  it('la pagina proyecta igual que el catalogo: mismos seis campos en cada item', async () => {
    findMany.mockResolvedValueOnce([FILA_DE_SISTEMA_BASE, FILA_DE_EMPRESA_DERIVADA]);
    count.mockResolvedValueOnce(2);

    const pagina = await listUnitsPage(SIN_CONSULTA, SCOPE);

    expect(pagina.total).toBe(2);
    for (const vista of pagina.items) {
      expect([...Object.keys(vista)].sort()).toEqual([...CAMPOS_DE_LA_VISTA].sort());
    }
    expect(pagina.items[1]?.factor).toBe('25.0000');
    expect(pagina.items[1]?.isSystem).toBe(false);
  });

  it('el adaptador NO convierte el factor a numero en ninguna linea (test de fuente, R1)', () => {
    const fuente = readFileSync(
      join(
        repoRoot,
        'lib',
        'modules',
        'unidades',
        'adapters',
        'driven',
        'persistence',
        'unit-prisma.ts',
      ),
      'utf8',
    );

    for (const prohibido of ['Number(', 'parseFloat', 'toNumber(']) {
      expect(
        fuente,
        `unit-prisma.ts usa ${prohibido}: el factor dejaria de ser texto`,
      ).not.toContain(prohibido);
    }
    expect(fuente).toContain('row.factor?.toString() ?? null');
  });
});
