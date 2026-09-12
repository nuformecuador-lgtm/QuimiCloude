/**
 * QC-57 T14 — El listado de PRODUCTOS con el contrato generico, contra Postgres REAL.
 *
 * POR QUE ESTE ARCHIVO EXISTE Y NO BASTA UN UNITARIO: un doble del puerto puede afirmar que la
 * consulta saneada llego al repositorio, pero NO que el motor filtro y ordeno el conjunto
 * completo ANTES de paginar (R13). Esa es exactamente la diferencia entre filtrar en la base y
 * filtrar la pagina ya traida —lo que QC-22 y QC-26 rechazaron por enganoso—, y solo Postgres
 * puede demostrarla. Por eso el caso central siembra MAS FILAS QUE UNA PAGINA y comprueba que la
 * fila que corresponde aparece en la pagina 1 aunque en el orden de hoy estuviera en la 3.
 *
 * AISLAMIENTO: `listAliveProducts` llama al cliente Prisma GLOBAL, no a un `tx` inyectado, asi
 * que una transaccion que se deshace NO lo envuelve (esta explicado con detalle en la cabecera de
 * `product-crud.int.test.ts`). Se crean filas REALES y se borran en el `afterAll` POR SU
 * IDENTIFICADOR EXACTO, nunca por rango ni por nombre.
 *
 * NINGUNA AFIRMACION GLOBAL sobre el catalogo: todos los casos acotan por el MARCADOR DEL
 * ARCHIVO, que `token()` mete en el nombre de toda fila sembrada y que entra por `search` —la
 * busqueda es parte del contrato (R16, R18), asi que el propio acotado lo ejercita—. Una base con
 * mas productos cargados no puede volver rojo este archivo.
 *
 * ACOTADO CAMBIADO EL 2026-09-11 POR QC-80 (R21): hasta hoy se acotaba con el filtro `select`
 * `unitId`, que era una columna de `products`. La columna ya no existe y el filtro salio de
 * `PRODUCT_QUERYABLE`, asi que pasarlo seria pasar un filtro desconocido —que `sanitize` omite en
 * silencio (R5)— y el archivo entero habria dejado de acotar sin que nada se pusiera rojo. El
 * marcador en el nombre acota igual de fuerte y no depende de ninguna columna que pueda irse.
 *
 * Cubre R7, R10, R13, R14, R15, R16, R18, R29 y la decision cerrada de los nulos de QC-57, y
 * R22 y R23 de QC-80 (la unidad DERIVADA del lote mas reciente).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listAliveProducts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { normalizeProductName } from '@/lib/modules/inventario';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { ListFilterValue, ListQuery } from '@/lib/modules/inventario/domain/list-query';

/**
 * Marcador irrepetible de ESTE ARCHIVO, en minusculas y solo alfanumerico para que sobreviva
 * intacto a `normalizeProductName`. Va dentro de CADA `token()`, y por tanto dentro del nombre
 * de cada fila sembrada aqui: es lo que permite acotar toda consulta a lo que este archivo puso.
 */
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

/**
 * Empresa propia del archivo y AMBITO de todas sus consultas (QC-49 R1, R13, R14).
 *
 * `products.company_id` es NOT NULL desde `<ts>_inventory_company_scope`, y `listAliveProducts`
 * exige el ambito en su firma: sin el no compila. Se siembra una empresa EFIMERA en vez de
 * reutilizar la de instalacion porque asi el ambito acota el conjunto entero y ninguna fila de
 * otro archivo ni de otra sesion puede entrar en un recuento. Se borra en el `afterAll`, la
 * ultima, cuando ya no queda inventario que la referencie.
 *
 * ESTE ARCHIVO NO PRUEBA EL AISLAMIENTO: sigue probando orden, filtro, busqueda y paginacion,
 * exactamente los mismos casos de QC-57. El aislamiento es `company-scope-queries.int.test.ts`.
 */
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

/** Identificadores de todo lo sembrado, para borrarlo por `id` EXACTO en el `afterAll`. */
const productosSembrados: string[] = [];
const lotesSembrados: string[] = [];
const presentacionesSembradas: string[] = [];
const unidadesSembradas: string[] = [];

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return {
    page: 1,
    sort: null,
    filters: {},
    // El acotado del archivo: la busqueda por el marcador deja EXACTAMENTE las filas sembradas
    // aqui. Quien lo sobrescriba acota por su cuenta, y lo dice en su caso.
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

/** Unidad de apoyo. SIN empresa -de sistema-, con simbolo derivado del nombre: desde QC-76 (R15)
 *  el simbolo es unico dentro del ambito y un `'kg'` fijo chocaria con el catalogo arrancador. */
async function sembrarUnidad(): Promise<string> {
  const name = `unidad ${token()}`;
  const { id } = await prisma.unit.create({
    data: { name, nameNormalized: normalizeForTest(name), symbol: name },
    select: { id: true },
  });
  unidadesSembradas.push(id);
  return id;
}

/** Presentacion de apoyo CON su unidad (QC-80 R1: `presentations.unit_id` es NOT NULL). */
async function sembrarPresentacion(unitId: string): Promise<string> {
  const name = `presentacion ${token()}`;
  const { id } = await prisma.presentation.create({
    data: { name, nameNormalized: normalizeForTest(name), unitId, companyId: empresaDelArchivo },
    select: { id: true },
  });
  presentacionesSembradas.push(id);
  return id;
}

/** Lote de apoyo con `createdAt` EXPLICITO: es la columna por la que QC-80 (R22) decide cual es
 *  el lote «mas reciente», asi que dejarla al reloj haria el caso dependiente del orden de
 *  insercion. */
async function sembrarLote(
  productId: string,
  presentationId: string,
  createdAt: Date,
): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: {
      productId,
      presentationId,
      stock: 1,
      unitCost: '1.0000',
      createdAt,
      // QC-49 R2/R22: el lote declara SU empresa, y `product_batches_check_company` exige que
      // coincida con la de su producto Y con la de su presentacion. Las tres son la del archivo.
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  lotesSembrados.push(id);
  return id;
}

afterAll(async () => {
  // Por `id` EXACTO y en el orden que exigen las FK (todas ON DELETE RESTRICT): lotes ->
  // productos -> presentaciones -> unidades.
  await prisma.productBatch.deleteMany({ where: { id: { in: lotesSembrados } } });
  await prisma.product.deleteMany({ where: { id: { in: productosSembrados } } });
  await prisma.presentation.deleteMany({ where: { id: { in: presentacionesSembradas } } });
  await prisma.unit.deleteMany({ where: { id: { in: unidadesSembradas } } });
  // La empresa del archivo va la ULTIMA: las tres FK a `companies` son ON DELETE RESTRICT.
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } });
  await prisma.$disconnect();
});

describe('el orden y el filtro se aplican sobre el CONJUNTO COMPLETO y antes de paginar (R13, R14)', () => {
  const PREFIJO = `ZZ-orden-${token()}`;
  /** Doce filas: mas que una pagina de cinco, que es lo que hace el caso demostrativo. */
  const NOMBRES = Array.from({ length: 12 }, (_, i) => `${PREFIJO} ${String(i + 1).padStart(2, '0')}`);

  beforeAll(async () => {
    await sembrar(
      NOMBRES.map((name, i) => ({ name, stock: i + 1, qtyAlert: (i + 1) % 2 === 0 ? i + 1 : null })),
    );
  });

  it('la fila que en el orden de hoy esta en la pagina 3 aparece en la 1 al ordenar al reves', async () => {
    // R13 — el aserto que distingue filtrar en la BASE de filtrar la pagina ya traida.
    const nombreDeLaUltima = NOMBRES[NOMBRES.length - 1];

    // En el orden de HOY (`name ASC`), con paginas de 5, la fila 12 cae en la pagina 3.
    const porDefectoPagina3 = await listAliveProducts(consulta({ page: 3, pageSize: 5 }), ambito());
    expect(porDefectoPagina3.items.map((p) => p.name)).toContain(nombreDeLaUltima);
    const porDefectoPagina1 = await listAliveProducts(consulta({ page: 1, pageSize: 5 }), ambito());
    expect(porDefectoPagina1.items.map((p) => p.name)).not.toContain(nombreDeLaUltima);

    // Pidiendo el orden inverso, la MISMA fila tiene que salir en la pagina 1: si el orden se
    // aplicara sobre la pagina ya traida, seguiria estando en la 3.
    const desc = await listAliveProducts(
      consulta({ page: 1, pageSize: 5, sort: { columnId: 'name', direction: 'desc' } }),
      ambito(),
    );
    expect(desc.items[0]?.name).toBe(nombreDeLaUltima);
  });

  it('un filtro que deja fuera casi todo trae la fila en la pagina 1 y el total describe lo filtrado (R14)', async () => {
    // R13 + R14 — `total` y `totalPages` son del conjunto YA FILTRADO, no del catalogo.
    const pagina = await listAliveProducts(
      consulta({
        page: 1,
        pageSize: 5,
        filters: { stock: { kind: 'numberRange', min: 12, max: 12 } },
      }),
      ambito(),
    );

    expect(pagina.items.map((p) => p.name)).toEqual([NOMBRES[NOMBRES.length - 1]]);
    expect(pagina.total).toBe(1);
    expect(pagina.totalPages).toBe(1);
  });

  it('dos filtros a la vez: una fila sale solo si cumple LOS DOS (R15)', async () => {
    // R15 — `stock` entre 5 y 12 son ocho filas; de ellas, solo las de indice par tienen
    // `qtyAlert`, asi que exigir tambien un rango de `qtyAlert` deja cuatro.
    const pagina = await listAliveProducts(
      consulta({
        pageSize: 25,
        filters: {
          stock: { kind: 'numberRange', min: 5, max: 12 },
          qtyAlert: { kind: 'numberRange', min: 5, max: 12 },
        },
      }),
      ambito(),
    );

    expect(pagina.total).toBe(4);
    expect(pagina.items.every((p) => p.qtyAlert !== null)).toBe(true);
    expect(pagina.items.every((p) => (p.stock ?? 0) >= 5)).toBe(true);
  });

  it('pedir 100 por pagina se ACOTA a 25, no se rechaza (R29)', async () => {
    // R29 — acotar, no rechazar. El `pageSize` que sale es el efectivo, nunca el pedido.
    const pagina = await listAliveProducts(consulta({ page: 1, pageSize: 100 }), ambito());

    expect(pagina.pageSize).toBe(MAX_PAGE_SIZE);
    expect(pagina.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });
});

describe('desempate estable por identificador (R10)', () => {
  it('cuatro homonimos con el mismo valor de orden no se repiten ni se pierden entre paginas', async () => {
    // R10 — el nombre de producto NO es unico; sin el desempate por `id`, dos filas empatadas
    // pueden intercambiarse entre consultas y una acabaria saliendo dos veces —o ninguna—.
    const nombre = `Homonimo ${token()}`;
    await sembrar([1, 2, 3, 4].map(() => ({ name: nombre, stock: 7 })));

    const vistos: string[] = [];
    for (const page of [1, 2]) {
      const pagina = await listAliveProducts(
        consulta({
          page,
          pageSize: 2,
          sort: { columnId: 'stock', direction: 'asc' },
          filters: { stock: { kind: 'numberRange', min: 7, max: 7 } },
        }),
        ambito(),
      );
      vistos.push(...pagina.items.map((p) => p.id));
    }

    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
    // Todas empatan en `stock`: lo unico que puede ordenarlas es el desempate por `id`.
    expect([...vistos].sort()).toEqual(vistos);
  });
});

describe('los nulos van SIEMPRE al final, en las DOS direcciones (decision cerrada 2026-09-04)', () => {
  const CON_VALOR = `Nulos ${token()}`;

  beforeAll(async () => {
    await sembrar([
      { name: `${CON_VALOR} a`, stock: 1 },
      { name: `${CON_VALOR} b`, stock: 99 },
      { name: `${CON_VALOR} c`, stock: null },
      { name: `${CON_VALOR} d`, stock: null },
    ]);
  });

  // Sin filtros: la busqueda por el token de este describe -que ademas lleva dentro el marcador
  // del archivo- deja exactamente estas cuatro filas.
  const soloEstas = (): Record<string, ListFilterValue> => ({});

  for (const direction of ['asc', 'desc'] as const) {
    it(`en ${direction}, las filas sin existencia registrada salen las ultimas`, async () => {
      // Decision cerrada: `NULLS LAST` EXPLICITO en las dos direcciones. Por defecto Postgres
      // los pondria al final en `ASC` pero al PRINCIPIO en `DESC`, y ordenar de mayor a menor
      // arrancaria con todos los productos sin existencia — que es justo lo que se descarto.
      const pagina = await listAliveProducts(
        consulta({
          pageSize: 25,
          sort: { columnId: 'stock', direction },
          filters: soloEstas(),
          search: normalizeProductName(CON_VALOR),
        }),
        ambito(),
      );

      const stocks = pagina.items.map((p) => p.stock);
      expect(stocks).toHaveLength(4);
      expect(stocks.slice(0, 2).every((s) => s !== null)).toBe(true);
      expect(stocks.slice(2)).toEqual([null, null]);
    });
  }
});

describe('la busqueda ignora acentos y mayusculas (R16, R18, R19)', () => {
  it('buscar «solucion» encuentra «Solución Buffer pH 7»', async () => {
    // R18 — el termino se normaliza con la MISMA funcion que escribio `name_normalized`
    // (`normalizeProductName`), asi que buscar y comparar no discrepan (R19).
    // El marcador va DELANTE del nombre y DELANTE del termino buscado: asi el caso sigue
    // acotado a sus dos filas -es un `toEqual` con `total` 1- sin dejar de ser lo que prueba,
    // porque lo que se busca sigue escribiendose sin acentos y en minusculas y el nombre
    // guardado los lleva.
    const marca = token();
    await sembrar([
      { name: `${marca} Solución Buffer pH 7`, stock: 1 },
      { name: `${marca} Agua destilada`, stock: 1 },
    ]);

    const pagina = await listAliveProducts(
      consulta({ pageSize: 25, search: `${marca} solucion buffer` }),
      ambito(),
    );

    expect(pagina.items.map((p) => p.name)).toEqual([`${marca} Solución Buffer pH 7`]);
    expect(pagina.total).toBe(1);
  });

  it('la busqueda es por SUBCADENA: una palabra del medio encuentra el nombre compuesto', async () => {
    // R16 + decision cerrada de `pg_trgm` (via A): bajar a prefijo habria roto esto en silencio.
    // Aqui el termino NO puede llevar el marcador delante: seria un prefijo, y lo que el caso
    // prueba es justamente que valga una palabra DEL MEDIO. Por eso el acotado lo hace el propio
    // termino -`de sodio 5` es especifico- y el aserto es `toContain`, no una igualdad.
    const marca = token();
    await sembrar([{ name: `${marca} Hipoclorito de sodio 5%`, stock: 1 }]);

    const pagina = await listAliveProducts(consulta({ pageSize: 25, search: 'de sodio 5' }), ambito());

    expect(pagina.items.map((p) => p.name)).toContain(`${marca} Hipoclorito de sodio 5%`);
  });
});

describe('el borrado logico no sale del listado, filtre lo que filtre (R7)', () => {
  it('una fila borrada que cumple el filtro sigue sin aparecer y no cuenta en el total', async () => {
    // R7 — `deleted_at IS NULL` va SIEMPRE en el `where`, y `deletedAt` no es consultable.
    const marca = `Borrado ${token()}`;
    await sembrar([
      { name: `${marca} viva`, stock: 42 },
      { name: `${marca} muerta`, stock: 42, deletedAt: new Date() },
    ]);

    const pagina = await listAliveProducts(
      consulta({
        pageSize: 25,
        filters: { stock: { kind: 'numberRange', min: 42, max: 42 } },
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
    // Decision cerrada del 2026-09-04 (manda sobre `design.md > 3.3`): `from` es 00:00:00.000Z
    // del dia y `to` es el FINAL del dia, implementado como `< 00:00:00Z del dia siguiente`
    // para no perder las marcas con microsegundos por encima del ultimo milisegundo.
    const marca = `Fechas ${token()}`;
    await sembrar([
      { name: `${marca} borde inicial`, stock: 1, createdAt: new Date(`${DIA}T00:00:00.000Z`) },
      { name: `${marca} borde final`, stock: 1, createdAt: new Date(`${DIA}T23:59:59.999Z`) },
      { name: `${marca} dia siguiente`, stock: 1, createdAt: new Date('2031-03-11T00:00:00.000Z') },
      { name: `${marca} dia anterior`, stock: 1, createdAt: new Date('2031-03-09T23:59:59.999Z') },
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

// ---------------------------------------------------------------------------
// QC-80 (T13) — la unidad DERIVADA del lote mas reciente, contra la base
// ---------------------------------------------------------------------------

describe('QC-80 — el listado devuelve la unidad derivada del lote mas reciente (R22, R23)', () => {
  it('un producto con DOS lotes de presentaciones distintas devuelve la unidad del MAS RECIENTE (R22)', async () => {
    // R22 — la derivacion es `created_at DESC`, desempatando por `id DESC`. El lote VIEJO se
    // inserta EL ULTIMO a proposito: si el adaptador ordenara por orden de insercion, o se
    // olvidara del `orderBy`, este caso lo diria.
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
    // Y no es la otra: sin esto, un adaptador que devolviera siempre la primera unidad que
    // encuentra pasaria la mitad de las veces.
    expect(pagina.items[0]?.latestBatchUnitId).not.toBe(unidadVieja);
  });

  it('un producto SIN ningun lote devuelve null, y no desaparece del listado (R23)', async () => {
    // R23 — «ninguna» es `null`, y el producto se sigue listando: sin lote no hay dato con el
    // que acotar, pero eso no lo saca del catalogo ni bloquea nada.
    const marca = `Sin lotes ${token()}`;
    await sembrar([{ name: `${marca} recien dado de alta`, stock: null }]);

    const pagina = await listAliveProducts(consulta({ pageSize: 25, search: marca }), ambito());

    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]?.latestBatchUnitId).toBeNull();
  });
});
