/**
 * QC-57 T19 — El listado de UNIDADES con el contrato generico, contra Postgres REAL: sus DOS
 * lecturas, la del catalogo entero (`listUnits`) y la paginada (`listUnitsPage`).
 *
 * POR QUE ESTE ARCHIVO EXISTE Y NO BASTA UN UNITARIO: un doble del puerto puede afirmar que la
 * consulta saneada llego al repositorio, pero NO que el motor ordeno y busco sobre el conjunto
 * completo ANTES de paginar (R13). Por eso el caso central siembra MAS FILAS QUE UNA PAGINA y
 * comprueba que la fila que corresponde aparece en la pagina 1 aunque en el orden de hoy
 * estuviera en la 3.
 *
 * AISLAMIENTO: los dos adaptadores llaman al cliente Prisma GLOBAL, no a un `tx` inyectado, asi
 * que una transaccion que se deshace NO los envuelve (mismo motivo escrito en
 * `unit-repository.int.test.ts`). Se crean filas REALES y se borran en el `afterAll` por el
 * marcador que llevan todas en el nombre.
 *
 * NINGUNA AFIRMACION GLOBAL sobre el catalogo: el catalogo real trae unidades sembradas por la
 * migracion de QC-32, asi que todos los casos acotan por la BUSQUEDA del propio contrato sobre un
 * marcador unico —el acotado y lo que se ejercita son lo mismo—.
 *
 * `units` NO tiene `deleted_at`: aqui no hay ningun caso de borrado logico, porque no hay
 * borrado logico que probar. Tampoco hay caso de filtro: `UNIT_QUERYABLE.filterable` esta vacio
 * a proposito, y lo que se comprueba de eso es que `sanitize` lo poda (test unitario), no que el
 * adaptador traduzca un filtro que nadie declara.
 *
 * Cubre R10, R11, R13, R14, R16, R18, R19, R29 y la decision cerrada de los nulos.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  listUnits as listUnitsEnAmbito,
  listUnitsPage as listUnitsPageEnAmbito,
} from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { MAX_UNITS, normalizeUnitName } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { ListQuery } from '@/lib/modules/unidades/domain/list-query';
import type { UnitScope } from '@/lib/modules/unidades/domain/unit-scope';

/**
 * QC-76 (R17, R18) — los dos adaptadores EXIGEN ahora el ambito de la empresa en cuyo nombre se
 * pregunta. Este archivo no prueba el ambito —eso es `unit-repository.int.test.ts`—, sino el
 * orden, la busqueda y la paginacion, y todas sus filas se siembran SIN empresa, o sea DE
 * SISTEMA (`company_id` nulo, R11), que son visibles desde cualquier empresa. Por eso se fija
 * un ambito unico para todo el archivo y se envuelven las dos lecturas: cambia la FORMA de la
 * llamada y **ningun aserto** de este archivo (R21).
 */
const AMBITO: UnitScope = { companyId: '00000000-0000-4000-8000-0000000000aa' };

function listUnits(limit: number, query: ListQuery) {
  return listUnitsEnAmbito(limit, query, AMBITO);
}

function listUnitsPage(query: ListQuery) {
  return listUnitsPageEnAmbito(query, AMBITO);
}

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** Marcador de TODO el archivo: va en el nombre de cada fila sembrada y es lo que borra el
 *  `afterAll`. Ninguna unidad del catalogo real lo lleva. */
const MARCA = token();

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: MARCA, ...partial };
}

type Semilla = { readonly name: string; readonly symbol?: string | null };

async function sembrar(semillas: readonly Semilla[]): Promise<void> {
  for (const semilla of semillas) {
    await prisma.unit.create({
      data: {
        name: semilla.name,
        nameNormalized: normalizeUnitName(semilla.name),
        symbol: semilla.symbol ?? null,
      },
      select: { id: true },
    });
  }
}

afterAll(async () => {
  await prisma.unit.deleteMany({ where: { nameNormalized: { contains: MARCA } } });
  await prisma.$disconnect();
});

describe('el orden y la busqueda se aplican sobre el CONJUNTO COMPLETO y antes de paginar (R13, R14)', () => {
  const LOCAL = token();
  /** Doce filas: mas que una pagina de cinco. */
  const NOMBRES = Array.from(
    { length: 12 },
    (_, i) => `${MARCA} ${LOCAL} ${String(i + 1).padStart(2, '0')}`,
  );

  beforeAll(async () => {
    await sembrar(NOMBRES.map((name) => ({ name, symbol: 'u' })));
  });

  it('la fila que en el orden de hoy esta en la pagina 3 aparece en la 1 al ordenar al reves', async () => {
    // R13 — el aserto que distingue ordenar en la BASE de ordenar la pagina ya traida.
    const nombreDeLaUltima = NOMBRES[NOMBRES.length - 1];

    const porDefectoPagina3 = await listUnitsPage(
      consulta({ page: 3, pageSize: 5, search: LOCAL }),
    );
    expect(porDefectoPagina3.items.map((u) => u.name)).toContain(nombreDeLaUltima);
    const porDefectoPagina1 = await listUnitsPage(
      consulta({ page: 1, pageSize: 5, search: LOCAL }),
    );
    expect(porDefectoPagina1.items.map((u) => u.name)).not.toContain(nombreDeLaUltima);

    const desc = await listUnitsPage(
      consulta({
        page: 1,
        pageSize: 5,
        search: LOCAL,
        sort: { columnId: 'name', direction: 'desc' },
      }),
    );
    expect(desc.items[0]?.name).toBe(nombreDeLaUltima);
  });

  it('el total y el numero de paginas describen el conjunto YA FILTRADO (R14)', async () => {
    // R14 — `count` con el MISMO `where` que el `findMany`: doce filas, tres paginas de cinco,
    // por muchas unidades que tenga el catalogo real.
    const pagina = await listUnitsPage(consulta({ page: 1, pageSize: 5, search: LOCAL }));

    expect(pagina.items).toHaveLength(5);
    expect(pagina.total).toBe(12);
    expect(pagina.totalPages).toBe(3);
  });

  it('pedir 100 por pagina se ACOTA a 25, no se rechaza (R29)', async () => {
    // R29 — el `pageSize` que sale es el EFECTIVO, nunca el pedido.
    const pagina = await listUnitsPage(consulta({ page: 1, pageSize: 100, search: LOCAL }));

    expect(pagina.pageSize).toBe(MAX_PAGE_SIZE);
    expect(pagina.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('sin orden explicito, el orden es el de HOY: nombre ascendente (R11)', async () => {
    // R11 — ni la pagina ni el catalogo se mueven para quien no pide orden.
    const pagina = await listUnitsPage(consulta({ pageSize: 25, search: LOCAL }));
    const nombres = pagina.items.map((u) => u.name);
    expect([...nombres].sort()).toEqual(nombres);

    const catalogo = await listUnits(MAX_UNITS, consulta({ search: LOCAL }));
    const nombresDelCatalogo = catalogo.map((u) => u.name);
    expect([...nombresDelCatalogo].sort()).toEqual(nombresDelCatalogo);
  });

  it('el modo CATALOGO respeta la cota y aplica la misma busqueda y el mismo orden (R27, R40 de QC-32)', async () => {
    // R40 de QC-32 — ninguna consulta sin limite declarado; R27 — orden y busqueda tambien aqui.
    const catalogo = await listUnits(
      3,
      consulta({ search: LOCAL, sort: { columnId: 'name', direction: 'desc' } }),
    );

    expect(catalogo).toHaveLength(3);
    expect(catalogo[0]?.name).toBe(NOMBRES[NOMBRES.length - 1]);
  });
});

describe('desempate estable por identificador (R10)', () => {
  const LOCAL = token();

  beforeAll(async () => {
    await sembrar(
      [1, 2, 3, 4].map((n) => ({ name: `${MARCA} ${LOCAL} ${String(n)}`, symbol: 'zz' })),
    );
  });

  it('cuatro filas con el MISMO simbolo no se repiten ni se pierden entre paginas', async () => {
    // R10 — `symbol` no es unico: sin el desempate por `id`, dos filas empatadas pueden
    // intercambiarse entre consultas y una acabaria saliendo dos veces —o ninguna—.
    const vistos: string[] = [];
    for (const page of [1, 2]) {
      const pagina = await listUnitsPage(
        consulta({
          page,
          pageSize: 2,
          search: LOCAL,
          sort: { columnId: 'symbol', direction: 'asc' },
        }),
      );
      vistos.push(...pagina.items.map((u) => u.id));
    }

    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
    expect([...vistos].sort()).toEqual(vistos);
  });
});

describe('los nulos van SIEMPRE al final, en las DOS direcciones (decision cerrada 2026-09-04)', () => {
  const LOCAL = token();

  beforeAll(async () => {
    await sembrar([
      { name: `${MARCA} ${LOCAL} a`, symbol: 'aa' },
      { name: `${MARCA} ${LOCAL} b`, symbol: 'zz' },
      { name: `${MARCA} ${LOCAL} c`, symbol: null },
      { name: `${MARCA} ${LOCAL} d`, symbol: null },
    ]);
  });

  for (const direction of ['asc', 'desc'] as const) {
    it(`en ${direction}, las unidades sin simbolo salen las ultimas`, async () => {
      // Decision cerrada: `NULLS LAST` EXPLICITO en las dos direcciones. Por defecto Postgres
      // los pondria al final en `ASC` pero al PRINCIPIO en `DESC`.
      const pagina = await listUnitsPage(
        consulta({ pageSize: 25, search: LOCAL, sort: { columnId: 'symbol', direction } }),
      );

      const simbolos = pagina.items.map((u) => u.symbol);
      expect(simbolos).toHaveLength(4);
      expect(simbolos.slice(0, 2).every((s) => s !== null)).toBe(true);
      expect(simbolos.slice(2)).toEqual([null, null]);
    });
  }
});

describe('la busqueda ignora acentos y mayusculas (R16, R18, R19)', () => {
  const LOCAL = token();

  beforeAll(async () => {
    await sembrar([
      { name: `Mililitro ácido ${MARCA} ${LOCAL}`, symbol: 'mL' },
      { name: `Gramo ${MARCA} ${LOCAL}`, symbol: 'g' },
    ]);
  });

  it('buscar «acido» encuentra «ácido», sin tilde y en minusculas', async () => {
    // R18 + R19 — el termino se normaliza con `normalizeUnitName`, la MISMA funcion que escribio
    // `name_normalized` y la misma con la que el modulo compara nombres para la unicidad.
    const pagina = await listUnitsPage(consulta({ pageSize: 25, search: `MILILITRO ACIDO` }));

    expect(pagina.items.map((u) => u.name)).toEqual([`Mililitro ácido ${MARCA} ${LOCAL}`]);
    expect(pagina.total).toBe(1);
  });

  it('la busqueda es por SUBCADENA: una palabra del medio encuentra el nombre compuesto', async () => {
    // R16 + decision cerrada de `pg_trgm` (via A): bajar a prefijo habria roto esto en silencio.
    const pagina = await listUnitsPage(consulta({ pageSize: 25, search: 'acido' }));

    expect(pagina.items.map((u) => u.name)).toContain(`Mililitro ácido ${MARCA} ${LOCAL}`);
  });

  it('una busqueda que no normaliza a nada devuelve la lista sin filtrar por texto (R20)', async () => {
    // R20 — «solo signos» es ausencia de busqueda; el `where` queda limpio y el catalogo real
    // (las unidades de QC-32 incluidas) vuelve entero, acotado por la cota del modo catalogo.
    const catalogo = await listUnits(MAX_UNITS, consulta({ search: '   ' }));

    expect(catalogo.length).toBeGreaterThan(1);
  });
});
