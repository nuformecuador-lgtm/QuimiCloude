/**
 * QC-57 T17 — El listado de PROVEEDORES con el contrato generico, contra Postgres REAL.
 *
 * POR QUE ESTE ARCHIVO EXISTE Y NO BASTA UN UNITARIO: un doble del puerto puede afirmar que la
 * consulta saneada llego al repositorio, pero NO que el motor filtro y ordeno el conjunto
 * completo ANTES de paginar (R13). Esa es exactamente la diferencia entre filtrar en la base y
 * filtrar la pagina ya traida —lo que QC-22 y QC-26 rechazaron por enganoso—, y solo Postgres
 * puede demostrarla. Por eso el caso central siembra MAS FILAS QUE UNA PAGINA y comprueba que la
 * fila que corresponde aparece en la pagina 1 aunque en el orden de hoy estuviera en la 3.
 *
 * AISLAMIENTO: `listAliveSuppliers` llama al cliente Prisma GLOBAL, no a un `tx` inyectado, asi
 * que una transaccion que se deshace NO lo envuelve. Se crean filas REALES y se borran por id
 * exacto en el `afterAll`.
 *
 * NINGUNA AFIRMACION GLOBAL sobre el catalogo de proveedores: todos los casos acotan por la
 * BUSQUEDA con un token unico sembrado en el nombre —que es una propiedad declarada del
 * contrato (R16), asi que el propio acotado ejercita la feature—. Una base con mas proveedores
 * cargados no puede volver rojo este archivo.
 *
 * Cubre R7, R10, R13, R14, R15, R16, R18, R29 y el `dateRange` en UTC.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listAliveSuppliers } from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-prisma';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { ListFilterValue, ListQuery } from '@/lib/modules/proveedores/domain/list-query';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** Marca comun de TODAS las filas de este archivo: va dentro del nombre, asi que la busqueda
 *  del contrato -y solo ella- basta para acotar cada consulta a lo que sembro este archivo. */
const MARCA = `zzq57${token().slice(0, 12)}`;

const creados: string[] = [];

type Semilla = {
  readonly name: string;
  readonly createdAt?: Date;
  readonly deletedAt?: Date | null;
};

async function sembrar(semillas: readonly Semilla[]): Promise<void> {
  for (const semilla of semillas) {
    const fila = await prisma.supplier.create({
      data: {
        name: semilla.name,
        nameNormalized: normalizeSupplierName(semilla.name),
        // El CHECK `suppliers_contact_required` exige un contacto util en los vivos.
        phone: '+57 300 000 0000',
        deletedAt: semilla.deletedAt ?? null,
        ...(semilla.createdAt === undefined ? {} : { createdAt: semilla.createdAt }),
      },
      select: { id: true },
    });
    creados.push(fila.id);
  }
}

/** Acota la consulta a las filas de este archivo POR LA BUSQUEDA, que es contrato (R16). */
function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: MARCA, ...partial };
}

function soloLasMias(extra: Record<string, ListFilterValue> = {}): Record<string, ListFilterValue> {
  return { ...extra };
}

afterAll(async () => {
  if (creados.length > 0) {
    await prisma.supplier.deleteMany({ where: { id: { in: creados } } });
  }
  await prisma.$disconnect();
});

describe('el orden y el filtro se aplican sobre el CONJUNTO COMPLETO y antes de paginar (R13, R14)', () => {
  /** Doce filas: mas que una pagina de cinco, que es lo que hace el caso demostrativo. */
  const NOMBRES = Array.from(
    { length: 12 },
    (_, i) => `Proveedor ${MARCA} ${String(i + 1).padStart(2, '0')}`,
  );

  beforeAll(async () => {
    await sembrar(NOMBRES.map((name) => ({ name })));
  });

  it('la fila que en el orden de hoy esta en la pagina 3 aparece en la 1 al ordenar al reves', async () => {
    // R13 — el aserto que distingue filtrar en la BASE de filtrar la pagina ya traida.
    const nombreDeLaUltima = NOMBRES[NOMBRES.length - 1];

    // En el orden de HOY (`name ASC, id ASC`), con paginas de 5, la fila 12 cae en la pagina 3.
    const porDefectoPagina3 = await listAliveSuppliers(consulta({ page: 3, pageSize: 5 }));
    expect(porDefectoPagina3.items.map((s) => s.name)).toContain(nombreDeLaUltima);
    const porDefectoPagina1 = await listAliveSuppliers(consulta({ page: 1, pageSize: 5 }));
    expect(porDefectoPagina1.items.map((s) => s.name)).not.toContain(nombreDeLaUltima);

    // Pidiendo el orden inverso, la MISMA fila tiene que salir en la pagina 1: si el orden se
    // aplicara sobre la pagina ya traida, seguiria estando en la 3.
    const desc = await listAliveSuppliers(
      consulta({ page: 1, pageSize: 5, sort: { columnId: 'name', direction: 'desc' } }),
    );
    expect(desc.items[0]?.name).toBe(nombreDeLaUltima);
  });

  it('el total describe el conjunto YA FILTRADO, no el catalogo entero (R14)', async () => {
    // R14 — `total` y `totalPages` son del conjunto filtrado por la busqueda, y el mismo
    // `where` sirve al `findMany` y al `count`.
    const pagina = await listAliveSuppliers(consulta({ page: 1, pageSize: 5 }));

    const vivosConLaMarca = await prisma.supplier.count({
      where: { deletedAt: null, nameNormalized: { contains: MARCA } },
    });
    expect(pagina.total).toBe(vivosConLaMarca);
    expect(pagina.total).toBe(NOMBRES.length);
    expect(pagina.totalPages).toBe(Math.ceil(NOMBRES.length / 5));
    expect(pagina.items).toHaveLength(5);
  });

  it('pedir 100 por pagina se ACOTA a 25, no se rechaza (R29)', async () => {
    // R29 — acotar, no rechazar. El `pageSize` que sale es el efectivo, nunca el pedido.
    const pagina = await listAliveSuppliers(consulta({ page: 1, pageSize: 100 }));

    expect(pagina.pageSize).toBe(MAX_PAGE_SIZE);
    expect(pagina.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('sin orden explicito, el orden es el de HOY: name ASC (R11)', async () => {
    const pagina = await listAliveSuppliers(consulta({ pageSize: 25 }));

    const nombres = pagina.items.map((s) => s.name);
    expect([...nombres].sort()).toEqual(nombres);
  });
});

describe('desempate estable por identificador (R10)', () => {
  it('cuatro filas empatadas en el campo de orden no se repiten ni se pierden entre paginas', async () => {
    // R10 — el desempate por `id` no es adorno. El nombre de proveedor SI es unico entre los
    // vivos (indice unico parcial), asi que el empate se provoca donde de verdad puede darse:
    // cuatro altas con el MISMO `created_at`, ordenando por `createdAt`. Sin el segundo
    // criterio, el orden de las empatadas no esta definido y Postgres puede devolverlas
    // distinto en cada consulta: una acabaria saliendo dos veces —o ninguna—.
    const marca = `empate${token().slice(0, 8)}`;
    const MISMO_INSTANTE = new Date('2032-07-01T10:00:00.000Z');
    await sembrar(
      [1, 2, 3, 4].map((n) => ({
        name: `Empatado ${MARCA} ${marca} ${String(n)}`,
        createdAt: MISMO_INSTANTE,
      })),
    );

    const vistos: string[] = [];
    for (const page of [1, 2]) {
      const pagina = await listAliveSuppliers(
        consulta({
          page,
          pageSize: 2,
          sort: { columnId: 'createdAt', direction: 'asc' },
          search: marca,
        }),
      );
      vistos.push(...pagina.items.map((s) => s.id));
    }

    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
    // Todas empatan en `created_at`: lo unico que puede ordenarlas es el desempate por `id`.
    expect([...vistos].sort()).toEqual(vistos);
  });
});

describe('la busqueda ignora acentos y mayusculas (R16, R18, R19)', () => {
  it('buscar «quimicos» encuentra «Químicos del Pacífico»', async () => {
    // R18 — el termino se normaliza con la MISMA funcion que escribio `name_normalized`
    // (`normalizeSupplierName`, la que decide la unicidad), asi que buscar y comparar no
    // discrepan (R19).
    await sembrar([
      { name: `Químicos del Pacífico ${MARCA}` },
      { name: `Insumos Andinos ${MARCA}` },
    ]);

    const pagina = await listAliveSuppliers(
      consulta({ pageSize: 25, search: `quimicos del pacifico ${MARCA}` }),
    );

    expect(pagina.items.map((s) => s.name)).toEqual([`Químicos del Pacífico ${MARCA}`]);
    expect(pagina.total).toBe(1);
  });

  it('la busqueda es por SUBCADENA: una palabra del medio encuentra el nombre compuesto', async () => {
    // R16 + decision cerrada de `pg_trgm` (via A): bajar a prefijo habria roto esto en silencio.
    await sembrar([{ name: `Distribuidora Nacional de Reactivos ${MARCA}` }]);

    const pagina = await listAliveSuppliers(consulta({ pageSize: 25, search: `nacionalde` }));

    expect(pagina.items.map((s) => s.name)).toContain(
      `Distribuidora Nacional de Reactivos ${MARCA}`,
    );
  });
});

describe('el borrado logico no sale del listado, filtre lo que filtre (R7)', () => {
  it('una fila dada de baja que cumple la busqueda sigue sin aparecer y no cuenta en el total', async () => {
    // R7 — `deleted_at IS NULL` va SIEMPRE en el `where`, y `deletedAt` no es consultable.
    const marca = `baja${token().slice(0, 8)}`;
    await sembrar([
      { name: `Proveedor ${MARCA} ${marca} vivo` },
      { name: `Proveedor ${MARCA} ${marca} muerto`, deletedAt: new Date() },
    ]);

    const pagina = await listAliveSuppliers(consulta({ pageSize: 25, search: marca }));

    expect(pagina.items.map((s) => s.name)).toEqual([`Proveedor ${MARCA} ${marca} vivo`]);
    expect(pagina.total).toBe(1);
  });
});

describe('el rango de fechas se compara en UTC, con los dos extremos inclusivos (R15)', () => {
  const DIA = '2031-05-20';

  it('incluye el primer y el ultimo instante del dia en UTC, y excluye el dia siguiente', async () => {
    // Decision cerrada del 2026-09-04 (manda sobre `design.md > 3.3`): `from` es 00:00:00.000Z
    // del dia y `to` es el FINAL del dia, implementado como `< 00:00:00Z del dia siguiente`
    // para no perder las marcas con microsegundos por encima del ultimo milisegundo.
    //
    // R15 ademas: la busqueda y el rango se aplican LOS DOS a la vez.
    const marca = `fecha${token().slice(0, 8)}`;
    await sembrar([
      { name: `P ${MARCA} ${marca} borde inicial`, createdAt: new Date(`${DIA}T00:00:00.000Z`) },
      { name: `P ${MARCA} ${marca} borde final`, createdAt: new Date(`${DIA}T23:59:59.999Z`) },
      { name: `P ${MARCA} ${marca} dia siguiente`, createdAt: new Date('2031-05-21T00:00:00.000Z') },
      { name: `P ${MARCA} ${marca} dia anterior`, createdAt: new Date('2031-05-19T23:59:59.999Z') },
    ]);

    const pagina = await listAliveSuppliers(
      consulta({
        pageSize: 25,
        search: marca,
        filters: soloLasMias({ createdAt: { kind: 'dateRange', from: DIA, to: DIA } }),
      }),
    );

    expect(pagina.items.map((s) => s.name).sort()).toEqual(
      [`P ${MARCA} ${marca} borde final`, `P ${MARCA} ${marca} borde inicial`].sort(),
    );
    expect(pagina.total).toBe(2);
  });
});
