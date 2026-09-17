/**
 * Contra Postgres real porque un doble no demuestra que la base filtra y ordena el conjunto
 * completo antes de paginar: por eso los casos siembran mas filas que una pagina.
 * `listAliveProducts` usa el cliente Prisma global y una transaccion no lo envolveria: las filas
 * son reales y se borran en el `afterAll` por su `id` exacto. Todo se acota con el marcador del
 * archivo, que va en el nombre y entra por `search`: un filtro por columna se omite en silencio si
 * la columna desaparece.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listAliveProducts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { normalizeProductName } from '@/lib/modules/inventario';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { ListFilterValue, ListQuery } from '@/lib/modules/inventario/domain/list-query';

/** Minusculas y solo alfanumerico para que sobreviva intacto a `normalizeProductName`. */
const MARCA_DEL_ARCHIVO = `m${randomUUID().replace(/-/gu, '').slice(0, 12)}`;

function token(): string {
  return `${MARCA_DEL_ARCHIVO}${randomUUID().replace(/-/gu, '')}`;
}

/** Normalizacion de los datos de APOYO (unidades y presentaciones), que tienen la suya propia. */
function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

/** Empresa efimera y no la de instalacion: asi ninguna fila de otro archivo o sesion entra en un
 *  recuento. */
let empresaDelArchivo: string;

function ambito(): InventoryScope {
  return { companyId: empresaDelArchivo };
}

beforeAll(async () => {
  const nombre = `Empresa listado productos ${token()}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  empresaDelArchivo = company.id;
});

const productosSembrados: string[] = [];
const lotesSembrados: string[] = [];
const presentacionesSembradas: string[] = [];
const unidadesSembradas: string[] = [];

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return {
    page: 1,
    sort: null,
    filters: {},
    // Deja solo las filas sembradas aqui; quien lo sobrescriba acota por su cuenta.
    search: MARCA_DEL_ARCHIVO,
    ...partial,
  };
}

type Semilla = {
  readonly name: string;
  readonly stock?: number | null;
  readonly qtyAlert?: number | null;
  readonly createdAt?: Date;
  readonly deletedAt?: Date | null;
};

async function sembrar(semillas: readonly Semilla[]): Promise<readonly string[]> {
  const ids: string[] = [];
  for (const semilla of semillas) {
    const { id } = await prisma.product.create({
      data: {
        name: semilla.name,
        nameNormalized: normalizeProductName(semilla.name),
        stock: semilla.stock ?? null,
        qtyAlert: semilla.qtyAlert ?? null,
        deletedAt: semilla.deletedAt ?? null,
        companyId: empresaDelArchivo,
        ...(semilla.createdAt === undefined ? {} : { createdAt: semilla.createdAt }),
      },
      select: { id: true },
    });
    ids.push(id);
    productosSembrados.push(id);
  }
  return ids;
}

/** Simbolo derivado del nombre: es unico dentro del ambito y un `'kg'` fijo chocaria con el
 *  catalogo arrancador. */
async function sembrarUnidad(): Promise<string> {
  const name = `unidad ${token()}`;
  const { id } = await prisma.unit.create({
    data: { name, nameNormalized: normalizeForTest(name), symbol: name },
    select: { id: true },
  });
  unidadesSembradas.push(id);
  return id;
}

async function sembrarPresentacion(unitId: string): Promise<string> {
  const name = `presentacion ${token()}`;
  const { id } = await prisma.presentation.create({
    data: { name, nameNormalized: normalizeForTest(name), unitId, companyId: empresaDelArchivo },
    select: { id: true },
  });
  presentacionesSembradas.push(id);
  return id;
}

/** `createdAt` explicito: decide cual es el lote mas reciente, y dejarlo al reloj haria el caso
 *  dependiente del orden de insercion. */
async function sembrarLote(
  productId: string,
  presentationId: string,
  createdAt: Date,
  stock = 1,
): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: {
      productId,
      presentationId,
      stock,
      unitCost: '1.0000',
      // `lot` es unico por empresa.
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      createdAt,
      // `product_batches_check_company` exige la misma empresa en lote, producto y presentacion.
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  lotesSembrados.push(id);
  return id;
}

afterAll(async () => {
  // Por `id` exacto y en el orden que exigen las FK.
  await prisma.productBatch.deleteMany({ where: { id: { in: lotesSembrados } } });
  await prisma.product.deleteMany({ where: { id: { in: productosSembrados } } });
  await prisma.presentation.deleteMany({ where: { id: { in: presentacionesSembradas } } });
  await prisma.unit.deleteMany({ where: { id: { in: unidadesSembradas } } });
  // La empresa va la ultima: la referencian las tres tablas de inventario.
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } });
  await prisma.$disconnect();
});

describe('el orden y el filtro se aplican sobre el CONJUNTO COMPLETO y antes de paginar (R13, R14)', () => {
  const PREFIJO = `ZZ-orden-${token()}`;
  /** Mas filas que una pagina de cinco. */
  const NOMBRES = Array.from({ length: 12 }, (_, i) => `${PREFIJO} ${String(i + 1).padStart(2, '0')}`);

  beforeAll(async () => {
    await sembrar(
      NOMBRES.map((name, i) => ({
        name,
        qtyAlert: i + 1,
        createdAt: new Date(`2031-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
      })),
    );
  });

  it('la fila que en el orden de hoy esta en la pagina 3 aparece en la 1 al ordenar al reves', async () => {
    const nombreDeLaUltima = NOMBRES[NOMBRES.length - 1];

    const porDefectoPagina3 = await listAliveProducts(consulta({ page: 3, pageSize: 5 }), ambito());
    expect(porDefectoPagina3.items.map((p) => p.name)).toContain(nombreDeLaUltima);
    const porDefectoPagina1 = await listAliveProducts(consulta({ page: 1, pageSize: 5 }), ambito());
    expect(porDefectoPagina1.items.map((p) => p.name)).not.toContain(nombreDeLaUltima);

    // Si el orden se aplicara sobre la pagina ya traida, la fila seguiria en la pagina 3.
    const desc = await listAliveProducts(
      consulta({ page: 1, pageSize: 5, sort: { columnId: 'name', direction: 'desc' } }),
      ambito(),
    );
    expect(desc.items[0]?.name).toBe(nombreDeLaUltima);
  });

  it('un filtro que deja fuera casi todo trae la fila en la pagina 1 y el total describe lo filtrado (R14)', async () => {
    const pagina = await listAliveProducts(
      consulta({
        page: 1,
        pageSize: 5,
        filters: { qtyAlert: { kind: 'numberRange', min: 12, max: 12 } },
      }),
      ambito(),
    );

    expect(pagina.items.map((p) => p.name)).toEqual([NOMBRES[NOMBRES.length - 1]]);
    expect(pagina.total).toBe(1);
    expect(pagina.totalPages).toBe(1);
  });

  it('dos filtros a la vez: una fila sale solo si cumple LOS DOS (R15)', async () => {
    // `qtyAlert` entre 5 y 12 son ocho filas (indices 4..11) y `createdAt` desde el dia 9 al 12
    // son solo cuatro (indices 8..11): la interseccion son esas cuatro.
    const pagina = await listAliveProducts(
      consulta({
        pageSize: 25,
        filters: {
          qtyAlert: { kind: 'numberRange', min: 5, max: 12 },
          createdAt: { kind: 'dateRange', from: '2031-01-09', to: '2031-01-12' },
        },
      }),
      ambito(),
    );

    expect(pagina.total).toBe(4);
    expect(pagina.items.every((p) => (p.qtyAlert ?? 0) >= 9)).toBe(true);
  });

  it('pedir 100 por pagina se ACOTA a 25, no se rechaza (R29)', async () => {
    const pagina = await listAliveProducts(consulta({ page: 1, pageSize: 100 }), ambito());

    expect(pagina.pageSize).toBe(MAX_PAGE_SIZE);
    expect(pagina.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });
});

describe('desempate estable por identificador (R10)', () => {
  it('cuatro homonimos con el mismo valor de orden no se repiten ni se pierden entre paginas', async () => {
    // Sin desempate por `id`, dos filas empatadas pueden intercambiarse entre consultas y una
    // saldria dos veces, o ninguna.
    const nombre = `Homonimo ${token()}`;
    await sembrar([1, 2, 3, 4].map(() => ({ name: nombre, qtyAlert: 7 })));

    const vistos: string[] = [];
    for (const page of [1, 2]) {
      const pagina = await listAliveProducts(
        consulta({
          page,
          pageSize: 2,
          sort: { columnId: 'qtyAlert', direction: 'asc' },
          filters: { qtyAlert: { kind: 'numberRange', min: 7, max: 7 } },
        }),
        ambito(),
      );
      vistos.push(...pagina.items.map((p) => p.id));
    }

    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
    // Todas empatan en `qtyAlert`: lo unico que puede ordenarlas es el desempate por `id`.
    expect([...vistos].sort()).toEqual(vistos);
  });
});

describe('los nulos van SIEMPRE al final, en las DOS direcciones (decision cerrada 2026-09-04)', () => {
  const CON_VALOR = `Nulos ${token()}`;

  beforeAll(async () => {
    await sembrar([
      { name: `${CON_VALOR} a`, qtyAlert: 1 },
      { name: `${CON_VALOR} b`, qtyAlert: 99 },
      { name: `${CON_VALOR} c`, qtyAlert: null },
      { name: `${CON_VALOR} d`, qtyAlert: null },
    ]);
  });

  // Sin filtros: la busqueda por el token de este describe -que ademas lleva dentro el marcador
  // del archivo- deja exactamente estas cuatro filas.
  const soloEstas = (): Record<string, ListFilterValue> => ({});

  for (const direction of ['asc', 'desc'] as const) {
    it(`en ${direction}, las filas sin alerta configurada salen las ultimas`, async () => {
      // Por defecto Postgres pone los nulos al final en `ASC` pero al principio en `DESC`.
      const pagina = await listAliveProducts(
        consulta({
          pageSize: 25,
          sort: { columnId: 'qtyAlert', direction },
          filters: soloEstas(),
          search: normalizeProductName(CON_VALOR),
        }),
        ambito(),
      );

      const alertas = pagina.items.map((p) => p.qtyAlert);
      expect(alertas).toHaveLength(4);
      expect(alertas.slice(0, 2).every((s) => s !== null)).toBe(true);
      expect(alertas.slice(2)).toEqual([null, null]);
    });
  }
});

describe('la busqueda ignora acentos y mayusculas (R16, R18, R19)', () => {
  it('buscar «solucion» encuentra «Solución Buffer pH 7»', async () => {
    // El marcador va delante del nombre y del termino para acotar el caso a sus dos filas.
    const marca = token();
    await sembrar([
      { name: `${marca} Solución Buffer pH 7` },
      { name: `${marca} Agua destilada` },
    ]);

    const pagina = await listAliveProducts(
      consulta({ pageSize: 25, search: `${marca} solucion buffer` }),
      ambito(),
    );

    expect(pagina.items.map((p) => p.name)).toEqual([`${marca} Solución Buffer pH 7`]);
    expect(pagina.total).toBe(1);
  });

  it('la busqueda es por SUBCADENA: una palabra del medio encuentra el nombre compuesto', async () => {
    // El marcador no puede ir delante del termino: seria un prefijo, y el caso prueba una
    // palabra del medio. Por eso el aserto es `toContain` y no una igualdad.
    const marca = token();
    await sembrar([{ name: `${marca} Hipoclorito de sodio 5%` }]);

    const pagina = await listAliveProducts(consulta({ pageSize: 25, search: 'de sodio 5' }), ambito());

    expect(pagina.items.map((p) => p.name)).toContain(`${marca} Hipoclorito de sodio 5%`);
  });
});

describe('el borrado logico no sale del listado, filtre lo que filtre (R7)', () => {
  it('una fila borrada que cumple el filtro sigue sin aparecer y no cuenta en el total', async () => {
    const marca = `Borrado ${token()}`;
    await sembrar([
      { name: `${marca} viva`, qtyAlert: 42 },
      { name: `${marca} muerta`, qtyAlert: 42, deletedAt: new Date() },
    ]);

    const pagina = await listAliveProducts(
      consulta({
        pageSize: 25,
        filters: { qtyAlert: { kind: 'numberRange', min: 42, max: 42 } },
      }),
      ambito(),
    );

    expect(pagina.items.map((p) => p.name)).toEqual([`${marca} viva`]);
    expect(pagina.total).toBe(1);
  });
});

describe('el rango de fechas se compara en UTC, con los dos extremos inclusivos', () => {
  const DIA = '2031-03-10';

  it('incluye el primer y el ultimo instante del dia en UTC, y excluye el dia siguiente', async () => {
    // `to` es `< 00:00:00Z del dia siguiente` para no perder las marcas con microsegundos por
    // encima del ultimo milisegundo.
    const marca = `Fechas ${token()}`;
    await sembrar([
      { name: `${marca} borde inicial`, createdAt: new Date(`${DIA}T00:00:00.000Z`) },
      { name: `${marca} borde final`, createdAt: new Date(`${DIA}T23:59:59.999Z`) },
      { name: `${marca} dia siguiente`, createdAt: new Date('2031-03-11T00:00:00.000Z') },
      { name: `${marca} dia anterior`, createdAt: new Date('2031-03-09T23:59:59.999Z') },
    ]);

    const pagina = await listAliveProducts(
      consulta({
        pageSize: 25,
        filters: { createdAt: { kind: 'dateRange', from: DIA, to: DIA } },
      }),
      ambito(),
    );

    expect(pagina.items.map((p) => p.name).sort()).toEqual(
      [`${marca} borde final`, `${marca} borde inicial`].sort(),
    );
    expect(pagina.total).toBe(2);
  });
});

describe('QC-80 — el listado devuelve la unidad derivada del lote mas reciente (R22, R23)', () => {
  it('un producto con DOS lotes de presentaciones distintas devuelve la unidad del MAS RECIENTE (R22)', async () => {
    // El lote viejo se inserta el ultimo: si el adaptador ordenara por insercion, o se olvidara
    // del `orderBy`, este caso lo diria.
    const marca = `Derivada ${token()}`;
    const [productId] = await sembrar([{ name: `${marca} con lotes`, stock: 5 }]);
    if (productId === undefined) throw new Error('el producto de apoyo no se sembro');

    const unidadVieja = await sembrarUnidad();
    const unidadReciente = await sembrarUnidad();
    const presentacionVieja = await sembrarPresentacion(unidadVieja);
    const presentacionReciente = await sembrarPresentacion(unidadReciente);

    await sembrarLote(productId, presentacionReciente, new Date('2031-05-02T00:00:00.000Z'));
    await sembrarLote(productId, presentacionVieja, new Date('2031-05-01T00:00:00.000Z'));

    const pagina = await listAliveProducts(consulta({ pageSize: 25, search: marca }), ambito());

    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]?.latestBatchUnitId).toBe(unidadReciente);
    // Sin esto, un adaptador que devolviera la primera unidad que encuentra pasaria a veces.
    expect(pagina.items[0]?.latestBatchUnitId).not.toBe(unidadVieja);
  });

  it('un producto SIN ningun lote devuelve null, y no desaparece del listado (R23)', async () => {
    const marca = `Sin lotes ${token()}`;
    await sembrar([{ name: `${marca} recien dado de alta`, stock: null }]);

    const pagina = await listAliveProducts(consulta({ pageSize: 25, search: marca }), ambito());

    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]?.latestBatchUnitId).toBeNull();
  });
});

describe('QC-91 — el listado agrega la existencia por unidad (R1, R2, R3)', () => {
  it('un producto con dos lotes en dos unidades devuelve las dos existencias', async () => {
    const marca = `Existencia por unidad ${token()}`;
    const [productId] = await sembrar([{ name: `${marca} con lotes`, stock: null }]);
    if (productId === undefined) throw new Error('el producto de apoyo no se sembro');

    const unidadA = await sembrarUnidad();
    const unidadB = await sembrarUnidad();
    const presentacionA = await sembrarPresentacion(unidadA);
    const presentacionB = await sembrarPresentacion(unidadB);

    await sembrarLote(productId, presentacionA, new Date('2031-05-02T00:00:00.000Z'), 10);
    await sembrarLote(productId, presentacionB, new Date('2031-05-01T00:00:00.000Z'), 20);

    const pagina = await listAliveProducts(consulta({ pageSize: 25, search: marca }), ambito());

    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]?.stockByUnit).toEqual(
      expect.arrayContaining([
        { unitId: unidadA, quantity: 10 },
        { unitId: unidadB, quantity: 20 },
      ]),
    );
    expect(pagina.items[0]?.stockByUnit).toHaveLength(2);
  });
});
