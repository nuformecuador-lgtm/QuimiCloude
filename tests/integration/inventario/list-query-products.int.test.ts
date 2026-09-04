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
 * `product-crud.int.test.ts`). Se crean filas REALES y se borran en el `afterAll` por la
 * presentacion que las agrupa.
 *
 * NINGUNA AFIRMACION GLOBAL sobre el catalogo: todos los casos acotan por la presentacion
 * sembrada —que ademas es un filtro `select` declarado (R4), asi que el propio acotado ejercita
 * el contrato—. Una base con mas productos cargados no puede volver rojo este archivo.
 *
 * Cubre R7, R10, R13, R14, R15, R16, R18, R29 y la decision cerrada de los nulos.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listAliveProducts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { normalizeProductName } from '@/lib/modules/inventario';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { ListFilterValue, ListQuery } from '@/lib/modules/inventario/domain/list-query';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** Normalizacion de los datos de APOYO (presentacion, unidad), que tienen la suya propia. */
function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

let presentationId: string;
let otherPresentationId: string;
let unitId: string;

/**
 * Acota TODA consulta de este archivo a las filas sembradas aqui. Es un filtro `select` real
 * del contrato (`PRODUCT_QUERYABLE`), no un truco del test: acotar y ejercitar son lo mismo.
 */
function soloLasMias(): Record<string, ListFilterValue> {
  return { presentationId: { kind: 'select', values: [presentationId] } };
}

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return {
    page: 1,
    sort: null,
    filters: soloLasMias(),
    search: '',
    ...partial,
  };
}

type Semilla = {
  readonly name: string;
  readonly stock?: number | null;
  readonly qtyAlert?: number | null;
  readonly createdAt?: Date;
  readonly deletedAt?: Date | null;
  readonly presentation?: 'propia' | 'otra';
};

async function sembrar(semillas: readonly Semilla[]): Promise<void> {
  for (const semilla of semillas) {
    await prisma.product.create({
      data: {
        name: semilla.name,
        nameNormalized: normalizeProductName(semilla.name),
        presentationId: semilla.presentation === 'otra' ? otherPresentationId : presentationId,
        unitId,
        stock: semilla.stock ?? null,
        qtyAlert: semilla.qtyAlert ?? null,
        deletedAt: semilla.deletedAt ?? null,
        ...(semilla.createdAt === undefined ? {} : { createdAt: semilla.createdAt }),
      },
      select: { id: true },
    });
  }
}

beforeAll(async () => {
  const presentationName = `Bidon ${token()}`;
  const presentation = await prisma.presentation.create({
    data: { name: presentationName, nameNormalized: normalizeForTest(presentationName) },
    select: { id: true },
  });
  presentationId = presentation.id;

  const otherName = `Bidon ${token()}`;
  const other = await prisma.presentation.create({
    data: { name: otherName, nameNormalized: normalizeForTest(otherName) },
    select: { id: true },
  });
  otherPresentationId = other.id;

  const unitName = `unidad ${token()}`;
  const unit = await prisma.unit.create({
    data: { name: unitName, nameNormalized: normalizeForTest(unitName), symbol: 'kg' },
    select: { id: true },
  });
  unitId = unit.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { presentationId: { in: [presentationId, otherPresentationId] } },
  });
  await prisma.presentation.deleteMany({
    where: { id: { in: [presentationId, otherPresentationId] } },
  });
  await prisma.unit.deleteMany({ where: { id: unitId } });
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
    const porDefectoPagina3 = await listAliveProducts(consulta({ page: 3, pageSize: 5 }));
    expect(porDefectoPagina3.items.map((p) => p.name)).toContain(nombreDeLaUltima);
    const porDefectoPagina1 = await listAliveProducts(consulta({ page: 1, pageSize: 5 }));
    expect(porDefectoPagina1.items.map((p) => p.name)).not.toContain(nombreDeLaUltima);

    // Pidiendo el orden inverso, la MISMA fila tiene que salir en la pagina 1: si el orden se
    // aplicara sobre la pagina ya traida, seguiria estando en la 3.
    const desc = await listAliveProducts(
      consulta({ page: 1, pageSize: 5, sort: { columnId: 'name', direction: 'desc' } }),
    );
    expect(desc.items[0]?.name).toBe(nombreDeLaUltima);
  });

  it('un filtro que deja fuera casi todo trae la fila en la pagina 1 y el total describe lo filtrado (R14)', async () => {
    // R13 + R14 — `total` y `totalPages` son del conjunto YA FILTRADO, no del catalogo.
    const pagina = await listAliveProducts(
      consulta({
        page: 1,
        pageSize: 5,
        filters: { ...soloLasMias(), stock: { kind: 'numberRange', min: 12, max: 12 } },
      }),
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
          ...soloLasMias(),
          stock: { kind: 'numberRange', min: 5, max: 12 },
          qtyAlert: { kind: 'numberRange', min: 5, max: 12 },
        },
      }),
    );

    expect(pagina.total).toBe(4);
    expect(pagina.items.every((p) => p.qtyAlert !== null)).toBe(true);
    expect(pagina.items.every((p) => (p.stock ?? 0) >= 5)).toBe(true);
  });

  it('pedir 100 por pagina se ACOTA a 25, no se rechaza (R29)', async () => {
    // R29 — acotar, no rechazar. El `pageSize` que sale es el efectivo, nunca el pedido.
    const pagina = await listAliveProducts(consulta({ page: 1, pageSize: 100 }));

    expect(pagina.pageSize).toBe(MAX_PAGE_SIZE);
    expect(pagina.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('ordenar por un campo de la presentacion atraviesa la relacion (R10)', async () => {
    // R10 — `presentationName` no es una columna de `products`: se ordena por el `name` de la
    // presentacion unida. Con las dos presentaciones sembradas, el orden por ese campo tiene
    // que agrupar por presentacion.
    await sembrar([{ name: `${PREFIJO} otra`, stock: 1, presentation: 'otra' }]);

    const pagina = await listAliveProducts({
      page: 1,
      pageSize: 25,
      sort: { columnId: 'presentationName', direction: 'asc' },
      filters: {
        presentationId: { kind: 'select', values: [presentationId, otherPresentationId] },
      },
      search: '',
    });

    const nombresDePresentacion = pagina.items.map((p) => p.presentationName);
    expect([...nombresDePresentacion].sort()).toEqual(nombresDePresentacion);
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
          filters: { ...soloLasMias(), stock: { kind: 'numberRange', min: 7, max: 7 } },
        }),
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

  const soloEstas = (): Record<string, ListFilterValue> => ({
    ...soloLasMias(),
    // Sin acotar mas: la busqueda por el token deja exactamente estas cuatro filas.
  });

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
    const marca = token();
    await sembrar([
      { name: `Solución Buffer pH 7 ${marca}`, stock: 1 },
      { name: `Agua destilada ${marca}`, stock: 1 },
    ]);

    const pagina = await listAliveProducts(consulta({ pageSize: 25, search: `solucion buffer` }));

    expect(pagina.items.map((p) => p.name)).toEqual([`Solución Buffer pH 7 ${marca}`]);
    expect(pagina.total).toBe(1);
  });

  it('la busqueda es por SUBCADENA: una palabra del medio encuentra el nombre compuesto', async () => {
    // R16 + decision cerrada de `pg_trgm` (via A): bajar a prefijo habria roto esto en silencio.
    const marca = token();
    await sembrar([{ name: `Hipoclorito de sodio 5% ${marca}`, stock: 1 }]);

    const pagina = await listAliveProducts(consulta({ pageSize: 25, search: 'sodio' }));

    expect(pagina.items.map((p) => p.name)).toContain(`Hipoclorito de sodio 5% ${marca}`);
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
        filters: { ...soloLasMias(), stock: { kind: 'numberRange', min: 42, max: 42 } },
      }),
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
        filters: { ...soloLasMias(), createdAt: { kind: 'dateRange', from: DIA, to: DIA } },
      }),
    );

    expect(pagina.items.map((p) => p.name).sort()).toEqual(
      [`${marca} borde final`, `${marca} borde inicial`].sort(),
    );
    expect(pagina.total).toBe(2);
  });
});
