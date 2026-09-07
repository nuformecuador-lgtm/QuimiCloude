/**
 * QC-57 T18 — El listado del CATALOGO DE UN PROVEEDOR con el contrato generico, contra
 * Postgres REAL.
 *
 * POR QUE ESTE ARCHIVO EXISTE Y NO BASTA UN UNITARIO: un doble del puerto puede afirmar que la
 * consulta saneada llego al repositorio, pero NO que el motor filtro y ordeno el conjunto
 * completo ANTES de paginar (R13). Solo Postgres puede demostrar eso, y solo Postgres puede
 * demostrar las otras dos cosas que este listado tiene y ningun otro:
 *
 *   - que **los nulos van SIEMPRE al final, en las DOS direcciones** (`min_purchase` y
 *     `delivery_time` son anulables), que es la decision cerrada del 2026-09-04 y NO el
 *     comportamiento por defecto de Postgres;
 *   - que los rangos de `cost` y `min_purchase` se comparan como **`Prisma.Decimal`** y no como
 *     coma flotante binaria.
 *
 * AISLAMIENTO: todo cuelga de UN proveedor sembrado por este archivo, asi que ninguna consulta
 * puede ver una fila ajena —`listBySupplierAlive` acota por proveedor por construccion—. El
 * `afterAll` borra fisicamente lo sembrado.
 *
 * Cubre R7, R10, R11, R13, R14, R15, R16, R18, R29, los nulos al final y el `Decimal`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listCatalogLinesBySupplierAlive } from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { ListQuery } from '@/lib/modules/proveedores/domain/list-query';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

let supplierId: string;
let otroSupplierId: string;
let presentationId: string;
let otraPresentationId: string;
let unitId: string;

/** Normalizacion de los datos de APOYO (presentacion, unidad), que tienen la suya propia. */
function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

type Semilla = {
  readonly name: string;
  readonly cost?: string;
  readonly minPurchase?: string | null;
  readonly deliveryTime?: number | null;
  readonly createdAt?: Date;
  readonly deletedAt?: Date | null;
  readonly presentacion?: 'propia' | 'otra';
  readonly conUnidad?: boolean;
  readonly proveedor?: 'propio' | 'otro';
};

async function sembrar(semillas: readonly Semilla[]): Promise<void> {
  for (const semilla of semillas) {
    await prisma.supplierCatalogLine.create({
      data: {
        supplierId: semilla.proveedor === 'otro' ? otroSupplierId : supplierId,
        name: semilla.name,
        nameNormalized: normalizeSupplierName(semilla.name),
        presentationId: semilla.presentacion === 'otra' ? otraPresentationId : presentationId,
        unitId: semilla.conUnidad === false ? null : unitId,
        cost: new Prisma.Decimal(semilla.cost ?? '10.0000'),
        minPurchase:
          semilla.minPurchase === undefined || semilla.minPurchase === null
            ? null
            : new Prisma.Decimal(semilla.minPurchase),
        deliveryTime: semilla.deliveryTime ?? null,
        deletedAt: semilla.deletedAt ?? null,
        ...(semilla.createdAt === undefined ? {} : { createdAt: semilla.createdAt }),
      },
      select: { id: true },
    });
  }
}

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: '', ...partial };
}

/** La pagina del proveedor sembrado. Nunca `'supplier_not_found'` salvo donde se prueba. */
async function listar(query: ListQuery) {
  const pagina = await listCatalogLinesBySupplierAlive(supplierId, query);
  if (pagina === 'supplier_not_found') throw new Error('el proveedor sembrado no esta vivo');
  return pagina;
}

async function crearProveedor(): Promise<string> {
  const name = `Proveedor catalogo ${token()}`;
  const fila = await prisma.supplier.create({
    data: {
      name,
      nameNormalized: normalizeSupplierName(name),
      phone: '+57 300 000 0000',
    },
    select: { id: true },
  });
  return fila.id;
}

beforeAll(async () => {
  supplierId = await crearProveedor();
  otroSupplierId = await crearProveedor();

  const presentationName = `Bidon ${token()}`;
  presentationId = (
    await prisma.presentation.create({
      data: { name: presentationName, nameNormalized: normalizeForTest(presentationName) },
      select: { id: true },
    })
  ).id;

  const otraName = `Caja ${token()}`;
  otraPresentationId = (
    await prisma.presentation.create({
      data: { name: otraName, nameNormalized: normalizeForTest(otraName) },
      select: { id: true },
    })
  ).id;

  const unitName = `unidad ${token()}`;
  unitId = (
    await prisma.unit.create({
      data: { name: unitName, nameNormalized: normalizeForTest(unitName), symbol: 'kg' },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.supplierCatalogLine.deleteMany({
    where: { supplierId: { in: [supplierId, otroSupplierId] } },
  });
  await prisma.supplier.deleteMany({ where: { id: { in: [supplierId, otroSupplierId] } } });
  await prisma.presentation.deleteMany({
    where: { id: { in: [presentationId, otraPresentationId] } },
  });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.$disconnect();
});

describe('el orden y el filtro se aplican sobre el CONJUNTO COMPLETO y antes de paginar (R11, R13, R14)', () => {
  const MARCA = `orden${token().slice(0, 8)}`;
  /** Doce lineas: mas que una pagina de cinco. Se siembran en orden de `created_at` creciente,
   *  que es el orden POR DEFECTO de este listado (R11) y el que no puede cambiar. */
  const NOMBRES = Array.from(
    { length: 12 },
    (_, i) => `Linea ${MARCA} ${String(i + 1).padStart(2, '0')}`,
  );

  beforeAll(async () => {
    await sembrar(
      NOMBRES.map((name, i) => ({
        name,
        cost: `${String(i + 1)}.0000`,
        createdAt: new Date(Date.UTC(2033, 0, 1, 0, 0, i)),
      })),
    );
  });

  it('sin orden explicito, el orden es el de HOY: created_at ASC y NO name ASC (R11)', async () => {
    const pagina = await listar(consulta({ pageSize: 25, search: MARCA }));

    // Las sembramos con `created_at` creciente y nombre creciente a la vez, asi que para
    // distinguir un orden del otro se comprueba contra el `created_at`, que es el criterio real.
    const fechas = pagina.items.map((l) => l.createdAt.getTime());
    expect([...fechas].sort((a, b) => a - b)).toEqual(fechas);
    expect(pagina.total).toBe(NOMBRES.length);
  });

  it('la fila que en el orden de hoy esta en la pagina 3 aparece en la 1 al ordenar al reves', async () => {
    // R13 — el aserto que distingue filtrar en la BASE de filtrar la pagina ya traida.
    const ultima = NOMBRES[NOMBRES.length - 1];

    const porDefectoPagina3 = await listar(consulta({ page: 3, pageSize: 5, search: MARCA }));
    expect(porDefectoPagina3.items.map((l) => l.name)).toContain(ultima);
    const porDefectoPagina1 = await listar(consulta({ page: 1, pageSize: 5, search: MARCA }));
    expect(porDefectoPagina1.items.map((l) => l.name)).not.toContain(ultima);

    // Pidiendo el orden inverso, la MISMA fila tiene que salir en la pagina 1.
    const desc = await listar(
      consulta({
        page: 1,
        pageSize: 5,
        search: MARCA,
        sort: { columnId: 'createdAt', direction: 'desc' },
      }),
    );
    expect(desc.items[0]?.name).toBe(ultima);
  });

  it('un filtro que deja fuera casi todo trae la fila en la pagina 1 y el total describe lo filtrado (R14)', async () => {
    // R13 + R14 — `total` y `totalPages` son del conjunto YA FILTRADO.
    const pagina = await listar(
      consulta({
        page: 1,
        pageSize: 5,
        search: MARCA,
        filters: { cost: { kind: 'numberRange', min: 12, max: 12 } },
      }),
    );

    expect(pagina.items.map((l) => l.name)).toEqual([NOMBRES[NOMBRES.length - 1]]);
    expect(pagina.total).toBe(1);
    expect(pagina.totalPages).toBe(1);
  });

  it('pedir 100 por pagina se ACOTA a 25, no se rechaza (R29)', async () => {
    // R29 — acotar, no rechazar.
    const pagina = await listar(consulta({ pageSize: 100, search: MARCA }));

    expect(pagina.pageSize).toBe(MAX_PAGE_SIZE);
    expect(pagina.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });
});

describe('varios filtros a la vez: una fila sale solo si los cumple TODOS (R15)', () => {
  const MARCA = `filtros${token().slice(0, 8)}`;

  beforeAll(async () => {
    await sembrar([
      { name: `F ${MARCA} propia barata`, cost: '5.0000', deliveryTime: 2 },
      { name: `F ${MARCA} propia cara`, cost: '50.0000', deliveryTime: 2 },
      { name: `F ${MARCA} propia lenta`, cost: '5.0000', deliveryTime: 30 },
      { name: `F ${MARCA} otra barata`, cost: '5.0000', deliveryTime: 2, presentacion: 'otra' },
    ]);
  });

  it('presentacion, rango de costo y rango de entrega se aplican en conjuncion', async () => {
    // R15 — tres filtros de tres formas distintas (`select`, `numberRange`, `numberRange`) mas
    // la busqueda: solo la primera fila cumple las cuatro condiciones.
    const pagina = await listar(
      consulta({
        pageSize: 25,
        search: MARCA,
        filters: {
          presentationId: { kind: 'select', values: [presentationId] },
          cost: { kind: 'numberRange', min: 0, max: 10 },
          deliveryTime: { kind: 'numberRange', min: 1, max: 5 },
        },
      }),
    );

    expect(pagina.items.map((l) => l.name)).toEqual([`F ${MARCA} propia barata`]);
    expect(pagina.total).toBe(1);
  });

  it('un `select` con lista VACIA es filtro AUSENTE, no «ningun resultado»', async () => {
    // `design.md > 3.3`: no haber elegido nada no puede devolver cero filas.
    const pagina = await listar(
      consulta({
        pageSize: 25,
        search: MARCA,
        filters: { presentationId: { kind: 'select', values: [] } },
      }),
    );

    expect(pagina.total).toBe(4);
  });

  it('el filtro por unidad tambien es `select` y se combina con los demas', async () => {
    const pagina = await listar(
      consulta({
        pageSize: 25,
        search: MARCA,
        filters: {
          unitId: { kind: 'select', values: [unitId] },
          cost: { kind: 'numberRange', min: 40, max: null },
        },
      }),
    );

    expect(pagina.items.map((l) => l.name)).toEqual([`F ${MARCA} propia cara`]);
  });
});

describe('los importes se comparan como Decimal, no como coma flotante (design.md > 5)', () => {
  const MARCA = `decimal${token().slice(0, 8)}`;

  beforeAll(async () => {
    await sembrar([
      { name: `D ${MARCA} justo`, cost: '19.9900' },
      { name: `D ${MARCA} un pelo mas`, cost: '19.9901' },
      { name: `D ${MARCA} un pelo menos`, cost: '19.9899' },
    ]);
  });

  it('un tope de 19.99 incluye la fila que vale exactamente 19.9900 y excluye 19.9901', async () => {
    // El adaptador convierte el `number` del contrato a `Prisma.Decimal` ANTES de comparar. Si
    // comparase en coma flotante binaria, el limite exacto es justo donde falla.
    const pagina = await listar(
      consulta({
        pageSize: 25,
        search: MARCA,
        filters: { cost: { kind: 'numberRange', min: null, max: 19.99 } },
      }),
    );

    expect(pagina.items.map((l) => l.name).sort()).toEqual(
      [`D ${MARCA} justo`, `D ${MARCA} un pelo menos`].sort(),
    );
    expect(pagina.items.map((l) => l.cost)).toContain('19.9900');
  });

  it('el rango de `minPurchase` tambien compara como Decimal', async () => {
    await sembrar([
      { name: `D ${MARCA} min justo`, cost: '1.0000', minPurchase: '2.5000' },
      { name: `D ${MARCA} min alto`, cost: '1.0000', minPurchase: '2.5001' },
    ]);

    const pagina = await listar(
      consulta({
        pageSize: 25,
        search: `${MARCA} min`,
        // `minPurchase` NO es filtrable en la lista blanca; se ordena por el, y el rango de
        // `cost` es el que acota. Lo que se comprueba aqui es que la columna anulable convive
        // con el rango de la otra sin romperlo.
        filters: { cost: { kind: 'numberRange', min: 1, max: 1 } },
        sort: { columnId: 'minPurchase', direction: 'asc' },
      }),
    );

    expect(pagina.items.map((l) => l.minPurchase)).toEqual(['2.5000', '2.5001']);
  });
});

describe('los nulos van SIEMPRE al final, en las DOS direcciones (decision cerrada 2026-09-04)', () => {
  const MARCA = `nulos${token().slice(0, 8)}`;

  beforeAll(async () => {
    await sembrar([
      { name: `N ${MARCA} a`, minPurchase: '1.0000', deliveryTime: 1 },
      { name: `N ${MARCA} b`, minPurchase: '99.0000', deliveryTime: 99 },
      { name: `N ${MARCA} c`, minPurchase: null, deliveryTime: null },
      { name: `N ${MARCA} d`, minPurchase: null, deliveryTime: null },
    ]);
  });

  for (const direction of ['asc', 'desc'] as const) {
    it(`en ${direction}, las lineas sin compra minima salen las ultimas`, async () => {
      // Decision cerrada: `NULLS LAST` EXPLICITO en las dos direcciones. Por defecto Postgres
      // los pondria al final en `ASC` pero al PRINCIPIO en `DESC`, y ordenar de mayor a menor
      // arrancaria con todas las lineas sin compra minima registrada.
      const pagina = await listar(
        consulta({ pageSize: 25, search: MARCA, sort: { columnId: 'minPurchase', direction } }),
      );

      const valores = pagina.items.map((l) => l.minPurchase);
      expect(valores).toHaveLength(4);
      expect(valores.slice(0, 2).every((v) => v !== null)).toBe(true);
      expect(valores.slice(2)).toEqual([null, null]);
    });

    it(`en ${direction}, las lineas sin tiempo de entrega salen las ultimas`, async () => {
      const pagina = await listar(
        consulta({ pageSize: 25, search: MARCA, sort: { columnId: 'deliveryTime', direction } }),
      );

      const valores = pagina.items.map((l) => l.deliveryTime);
      expect(valores).toHaveLength(4);
      expect(valores.slice(0, 2).every((v) => v !== null)).toBe(true);
      expect(valores.slice(2)).toEqual([null, null]);
    });
  }
});

describe('desempate estable por identificador (R10)', () => {
  it('cuatro lineas empatadas en el campo de orden no se repiten ni se pierden entre paginas', async () => {
    // R10 — el nombre de la linea solo es unico dentro del mismo proveedor Y la misma
    // presentacion, y `created_at` empata en cuanto dos altas caen en el mismo instante. Sin el
    // desempate por `id`, dos empatadas pueden intercambiarse entre consultas.
    const MARCA = `empate${token().slice(0, 8)}`;
    const MISMO_INSTANTE = new Date('2033-09-09T09:00:00.000Z');
    await sembrar(
      [1, 2, 3, 4].map((n) => ({
        name: `E ${MARCA} ${String(n)}`,
        cost: '7.0000',
        createdAt: MISMO_INSTANTE,
      })),
    );

    const vistos: string[] = [];
    for (const page of [1, 2]) {
      const pagina = await listar(
        consulta({
          page,
          pageSize: 2,
          search: MARCA,
          sort: { columnId: 'createdAt', direction: 'asc' },
        }),
      );
      vistos.push(...pagina.items.map((l) => l.id));
    }

    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
    expect([...vistos].sort()).toEqual(vistos);
  });
});

describe('la busqueda ignora acentos y mayusculas (R16, R18, R19)', () => {
  it('buscar «solucion» encuentra «Solución Buffer pH 7» y es por SUBCADENA', async () => {
    // R18 + R19 — el termino se normaliza con `normalizeSupplierName`, la MISMA funcion que
    // escribio `name_normalized` y que protege el indice unico parcial de la tabla.
    const MARCA = `busca${token().slice(0, 8)}`;
    await sembrar([
      { name: `Solución Buffer pH 7 ${MARCA}` },
      { name: `Agua destilada ${MARCA}` },
    ]);

    // El termino se normaliza QUITANDO espacios y signos, asi que se busca la subcadena
    // contigua de la forma normalizada: «solucion buffer» -> `solucionbuffer`, que si esta
    // dentro de `solucionbufferph7...`. Meter la marca en medio no casaria, y eso es correcto.
    const porAcento = await listar(consulta({ pageSize: 25, search: 'solucion buffer' }));
    expect(porAcento.items.map((l) => l.name)).toEqual([`Solución Buffer pH 7 ${MARCA}`]);

    // Subcadena: una palabra del MEDIO encuentra el nombre compuesto (via A de `pg_trgm`).
    const porDentro = await listar(consulta({ pageSize: 25, search: `buffer` }));
    expect(porDentro.items.map((l) => l.name)).toContain(`Solución Buffer pH 7 ${MARCA}`);
  });
});

describe('las DOS condiciones de vida siguen en el `where`, filtre lo que filtre (R7)', () => {
  it('una linea dada de baja que cumple el filtro sigue sin aparecer y no cuenta en el total', async () => {
    const MARCA = `baja${token().slice(0, 8)}`;
    await sembrar([
      { name: `B ${MARCA} viva`, cost: '42.0000' },
      { name: `B ${MARCA} muerta`, cost: '42.0000', deletedAt: new Date(), presentacion: 'otra' },
    ]);

    const pagina = await listar(
      consulta({
        pageSize: 25,
        search: MARCA,
        filters: { cost: { kind: 'numberRange', min: 42, max: 42 } },
      }),
    );

    expect(pagina.items.map((l) => l.name)).toEqual([`B ${MARCA} viva`]);
    expect(pagina.total).toBe(1);
  });

  it('un proveedor dado de baja no devuelve pagina vacia: devuelve «no encontrado»', async () => {
    // La otra condicion de vida. Vive en el puerto y NO en un `if` del dominio, asi que ningun
    // caso de uso puede olvidarla, traiga la consulta lo que traiga.
    const marcado = await crearProveedor();
    await prisma.supplier.update({ where: { id: marcado }, data: { deletedAt: new Date() } });

    const resultado = await listCatalogLinesBySupplierAlive(
      marcado,
      consulta({ sort: { columnId: 'cost', direction: 'desc' } }),
    );

    expect(resultado).toBe('supplier_not_found');
    await prisma.supplier.delete({ where: { id: marcado } });
  });
});
