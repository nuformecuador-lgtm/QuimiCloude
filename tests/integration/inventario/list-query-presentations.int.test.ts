/**
 * QC-57 T15 — El listado de PRESENTACIONES con el contrato generico, contra Postgres REAL.
 *
 * Mismo motivo que su hermano de productos: un doble del puerto no puede demostrar que el motor
 * filtro y ordeno el conjunto completo ANTES de paginar (R13). Aqui tambien se siembran mas
 * filas que una pagina y se comprueba que la fila que en el orden de hoy caia en la pagina 3
 * aparece en la 1 cuando se pide otro orden.
 *
 * DIFERENCIA DE FONDO CON PRODUCTOS: `presentations` **no tiene `deleted_at`** (D6 de QC-20, el
 * borrado es fisico), asi que no hay ninguna condicion de vida que comprobar —ni que anadir—.
 * Lo que en productos es R7, aqui no aplica y por eso no hay ningun caso que lo finja.
 *
 * ACOTADO: `PRESENTATION_QUERYABLE` no declara ningun `select`, asi que el acotado de los casos
 * se hace por la BUSQUEDA (un token unico por bloque) o por el rango de fechas. Ninguna
 * afirmacion global sobre el catalogo.
 *
 * AISLAMIENTO: filas REALES, borradas en el `afterAll` por sus ids (el adaptador usa el cliente
 * Prisma global; ver la cabecera de `product-crud.int.test.ts`).
 *
 * Cubre R10, R13, R14, R16, R18, R29 y el rango de fechas en UTC.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listPresentations } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-prisma';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { ListQuery } from '@/lib/modules/inventario/domain/list-query';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/**
 * QC-80 (R1): `presentations.unit_id` es NOT NULL con FK a `units`, asi que toda
 * presentacion de apoyo necesita una unidad REAL. Se resuelve la unidad de sistema
 * `kilogramo` POR SU NOMBRE NORMALIZADO -nunca por un uuid escrito a mano: los
 * identificadores los genera `gen_random_uuid()` y son distintos en cada base-, que es
 * exactamente como la busca el relleno de la migracion. Ningun test de este archivo
 * afirma nada sobre la unidad de la presentacion: es solo lo que la columna exige.
 */
async function unidadDeSistema(db: typeof prisma): Promise<string> {
  const unit = await db.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  });
  return unit.id;
}

const creadas: string[] = [];

/**
 * Empresa propia del archivo y AMBITO de todas sus consultas (QC-49 R1, R13, R14).
 *
 * `presentations.company_id` es NOT NULL desde `<ts>_inventory_company_scope`, y
 * `listPresentations` exige el ambito en su firma: sin el no compila. Se siembra una empresa
 * EFIMERA en vez de reutilizar la de instalacion por la misma razon por la que cada caso acota
 * por su marcador -aqui ademas el ambito ya acota el conjunto entero, asi que ninguna fila de
 * otro archivo ni de otra sesion puede entrar en un recuento-. Se borra en el `afterAll`, la
 * ultima, cuando ya no queda ninguna presentacion que la referencie.
 *
 * ESTE ARCHIVO NO PRUEBA EL AISLAMIENTO: sigue probando orden, filtro, busqueda y paginacion,
 * exactamente los mismos casos de QC-57. El aislamiento es `company-scope-queries.int.test.ts`.
 */
let empresaDelArchivo: string;

function ambito(): InventoryScope {
  return { companyId: empresaDelArchivo };
}

beforeAll(async () => {
  const nombre = `Empresa listado presentaciones ${token()}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  empresaDelArchivo = company.id;
});

async function sembrar(nombres: readonly string[], createdAt?: Date): Promise<void> {
  for (const name of nombres) {
    const fila = await prisma.presentation.create({
      data: {
        name,
        nameNormalized: normalizePresentationName(name),
        unitId: await unidadDeSistema(prisma),
        companyId: empresaDelArchivo,
        ...(createdAt === undefined ? {} : { createdAt }),
      },
      select: { id: true },
    });
    creadas.push(fila.id);
  }
}

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: '', ...partial };
}

afterAll(async () => {
  await prisma.presentation.deleteMany({ where: { id: { in: creadas } } });
  // La empresa del archivo va DESPUES: `presentations_company_id_fkey` es ON DELETE RESTRICT.
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } });
  await prisma.$disconnect();
});

describe('orden, filtro y busqueda sobre el conjunto completo (R13, R14, R29)', () => {
  const MARCA = token();
  const NOMBRES = Array.from(
    { length: 12 },
    (_, i) => `Bidon ${MARCA} ${String(i + 1).padStart(2, '0')}`,
  );

  beforeAll(async () => {
    await sembrar(NOMBRES);
  });

  it('la fila que en el orden de hoy esta en la pagina 3 aparece en la 1 al ordenar al reves (R13)', async () => {
    const ultima = NOMBRES[NOMBRES.length - 1];

    const pagina3 = await listPresentations(consulta({ page: 3, pageSize: 5, search: MARCA }), ambito());
    expect(pagina3.items.map((p) => p.name)).toContain(ultima);

    const descPagina1 = await listPresentations(
      consulta({
        page: 1,
        pageSize: 5,
        search: MARCA,
        sort: { columnId: 'name', direction: 'desc' },
      }),
      ambito(),
    );
    expect(descPagina1.items[0]?.name).toBe(ultima);
  });

  it('el total y el numero de paginas describen el conjunto YA filtrado (R14)', async () => {
    // R14 — el `count` usa el MISMO `where` que el `findMany`: con la busqueda puesta, el total
    // es el de las doce sembradas, no el del catalogo entero.
    const pagina = await listPresentations(consulta({ page: 1, pageSize: 5, search: MARCA }), ambito());

    expect(pagina.total).toBe(NOMBRES.length);
    expect(pagina.totalPages).toBe(3);
    expect(pagina.items).toHaveLength(5);
  });

  it('pedir 100 por pagina se ACOTA a 25, no se rechaza (R29)', async () => {
    const pagina = await listPresentations(consulta({ pageSize: 100, search: MARCA }), ambito());

    expect(pagina.pageSize).toBe(MAX_PAGE_SIZE);
    expect(pagina.items).toHaveLength(NOMBRES.length);
  });

  it('sin orden, el orden es el de hoy: nombre ascendente (R11)', async () => {
    const pagina = await listPresentations(consulta({ pageSize: 25, search: MARCA }), ambito());

    const nombres = pagina.items.map((p) => p.name);
    expect(nombres).toEqual([...nombres].sort());
  });
});

describe('la busqueda ignora acentos y mayusculas (R16, R18, R19)', () => {
  it('buscar «solucion» encuentra «Solución»', async () => {
    // R18/R19 — el termino se normaliza con `normalizePresentationName`, la MISMA funcion que
    // escribe `presentations.name_normalized` y que respalda su indice unico.
    const marca = token();
    await sembrar([`Solución ${marca}`, `Frasco ${marca}`]);

    const pagina = await listPresentations(consulta({ pageSize: 25, search: `solucion ${marca}` }), ambito());

    expect(pagina.items.map((p) => p.name)).toEqual([`Solución ${marca}`]);
    expect(pagina.total).toBe(1);
  });
});

describe('el rango de fechas se compara en UTC, con los dos extremos inclusivos', () => {
  const DIA = '2031-07-04';

  it('incluye los dos bordes del dia en UTC y excluye el dia siguiente', async () => {
    const marca = token();
    await sembrar([`Borde inicial ${marca}`], new Date(`${DIA}T00:00:00.000Z`));
    await sembrar([`Borde final ${marca}`], new Date(`${DIA}T23:59:59.999Z`));
    await sembrar([`Dia siguiente ${marca}`], new Date('2031-07-05T00:00:00.000Z'));

    const pagina = await listPresentations(
      consulta({
        pageSize: 25,
        search: marca,
        filters: { createdAt: { kind: 'dateRange', from: DIA, to: DIA } },
      }),
      ambito(),
    );

    expect(pagina.items.map((p) => p.name).sort()).toEqual(
      [`Borde final ${marca}`, `Borde inicial ${marca}`].sort(),
    );
    expect(pagina.total).toBe(2);
  });
});

describe('desempate estable por identificador (R10)', () => {
  it('filas creadas en el MISMO instante no se repiten ni se pierden entre paginas', async () => {
    // R10 — el nombre de una presentacion es unico, asi que el empate solo puede darse por otra
    // columna: cuatro altas con el mismo `created_at`, ordenadas por `createdAt`. Sin el
    // desempate por `id` el orden entre ellas no esta definido y una podria salir dos veces.
    const marca = token();
    const instante = new Date('2031-08-08T08:08:08.000Z');
    await sembrar([1, 2, 3, 4].map((n) => `Empate ${marca} ${String(n)}`), instante);

    const vistos: string[] = [];
    for (const page of [1, 2]) {
      const pagina = await listPresentations(
        consulta({
          page,
          pageSize: 2,
          search: `empate ${marca}`,
          sort: { columnId: 'createdAt', direction: 'asc' },
        }),
        ambito(),
      );
      vistos.push(...pagina.items.map((p) => p.id));
    }

    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
    expect([...vistos].sort()).toEqual(vistos);
  });
});
