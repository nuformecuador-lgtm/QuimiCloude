/**
 * QC-57 T16 — El listado de RECETAS con el contrato generico, contra Postgres REAL.
 *
 * POR QUE ESTE ARCHIVO EXISTE Y NO BASTA UN UNITARIO: un doble del puerto puede afirmar que la
 * consulta saneada llego al repositorio, pero NO que el motor filtro y ordeno el conjunto
 * completo ANTES de paginar (R13). Esa es exactamente la diferencia entre filtrar en la base y
 * filtrar la pagina ya traida —lo que QC-22 y QC-26 rechazaron por enganoso—, y solo Postgres
 * puede demostrarla. Por eso el caso central siembra MAS FILAS QUE UNA PAGINA y comprueba que la
 * fila que corresponde aparece en la pagina 1 aunque en el orden de hoy estuviera en la 3.
 *
 * AISLAMIENTO: `listAliveRecipes` llama al cliente Prisma GLOBAL, no a un `tx` inyectado, asi
 * que una transaccion que se deshace NO lo envuelve (esta explicado con detalle en la cabecera de
 * `recipe-crud.int.test.ts`). Se crean filas REALES y se borran en el `afterAll` por el marcador
 * que llevan todas en el nombre.
 *
 * NINGUNA AFIRMACION GLOBAL sobre el catalogo: todos los casos acotan por la BUSQUEDA del propio
 * contrato sobre un marcador unico —o sea que el acotado y lo que se ejercita son lo mismo—. Una
 * base con mas recetas cargadas no puede volver rojo este archivo.
 *
 * LA VENTANA LLEGA CALCULADA DESDE FUERA (R40 de QC-26): `listAliveRecipes(offset, limit, query)`
 * no hace aritmetica de paginas. Este archivo usa el MISMO `toOffsetLimit` que inyecta
 * `lib/composition`, que es lo que hace que el acotado a 25 de R29 sea el real y no uno de test.
 *
 * Cubre R7, R10, R11, R13, R14, R15, R16, R18, R19, R29 y la decision cerrada del huso horario.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listAliveRecipes } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE, toOffsetLimit } from '@/lib/shared/pagination';

import type { ListQuery } from '@/lib/modules/recetas/domain/list-query';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** Marcador de TODO el archivo: va en el nombre de cada fila sembrada y es lo que borra el
 *  `afterAll`. Ninguna receta ajena lo lleva, asi que nada de fuera entra en estos casos. */
const MARCA = token();

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: MARCA, ...partial };
}

type Semilla = {
  readonly name: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly deletedAt?: Date | null;
};

async function sembrar(semillas: readonly Semilla[]): Promise<void> {
  for (const semilla of semillas) {
    await prisma.recipe.create({
      data: {
        name: semilla.name,
        nameNormalized: normalizeRecipeName(semilla.name),
        deletedAt: semilla.deletedAt ?? null,
        ...(semilla.createdAt === undefined ? {} : { createdAt: semilla.createdAt }),
        ...(semilla.updatedAt === undefined ? {} : { updatedAt: semilla.updatedAt }),
      },
      select: { id: true },
    });
  }
}

/** Una pagina del listado, con la ventana calculada como la calcula la composicion real. */
async function listar(
  query: ListQuery,
): Promise<{ nombres: readonly string[]; ids: readonly string[]; total: number; limit: number }> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const { rows, total } = await listAliveRecipes(offset, limit, query);
  return { nombres: rows.map((row) => row.name), ids: rows.map((row) => row.id), total, limit };
}

afterAll(async () => {
  await prisma.recipe.deleteMany({ where: { nameNormalized: { contains: MARCA } } });
  await prisma.$disconnect();
});

describe('el orden y el filtro se aplican sobre el CONJUNTO COMPLETO y antes de paginar (R13, R14)', () => {
  const LOCAL = token();
  /** Doce filas: mas que una pagina de cinco, que es lo que hace el caso demostrativo. */
  const NOMBRES = Array.from(
    { length: 12 },
    (_, i) => `${MARCA} ${LOCAL} ${String(i + 1).padStart(2, '0')}`,
  );

  beforeAll(async () => {
    await sembrar(NOMBRES.map((name) => ({ name })));
  });

  it('la fila que en el orden de hoy esta en la pagina 3 aparece en la 1 al ordenar al reves', async () => {
    // R13 — el aserto que distingue filtrar en la BASE de filtrar la pagina ya traida.
    const nombreDeLaUltima = NOMBRES[NOMBRES.length - 1];

    // En el orden de HOY (`name ASC`, R11), con paginas de 5, la fila 12 cae en la pagina 3.
    const porDefectoPagina3 = await listar(consulta({ page: 3, pageSize: 5, search: LOCAL }));
    expect(porDefectoPagina3.nombres).toContain(nombreDeLaUltima);
    const porDefectoPagina1 = await listar(consulta({ page: 1, pageSize: 5, search: LOCAL }));
    expect(porDefectoPagina1.nombres).not.toContain(nombreDeLaUltima);

    // Pidiendo el orden inverso, la MISMA fila sale en la pagina 1: si el orden se aplicara
    // sobre la pagina ya traida, seguiria estando en la 3.
    const desc = await listar(
      consulta({
        page: 1,
        pageSize: 5,
        search: LOCAL,
        sort: { columnId: 'name', direction: 'desc' },
      }),
    );
    expect(desc.nombres[0]).toBe(nombreDeLaUltima);
  });

  it('el total describe el conjunto YA FILTRADO, no el catalogo entero (R14)', async () => {
    // R14 — el `count` usa el MISMO `where` que el `findMany`: doce filas sembradas, doce de
    // total, aunque la pagina traiga cinco y la base tenga muchas mas recetas.
    const pagina = await listar(consulta({ page: 1, pageSize: 5, search: LOCAL }));

    expect(pagina.nombres).toHaveLength(5);
    expect(pagina.total).toBe(12);
  });

  it('pedir 100 por pagina se ACOTA a 25, no se rechaza (R29)', async () => {
    // R29 — acotar, no rechazar. El acotado lo hace `toOffsetLimit`, que en produccion inyecta
    // `lib/composition` y aqui se usa el mismo.
    const pagina = await listar(consulta({ page: 1, pageSize: 100, search: LOCAL }));

    expect(pagina.limit).toBe(MAX_PAGE_SIZE);
    expect(pagina.nombres.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('sin orden explicito, el orden es el de HOY: nombre ascendente (R11)', async () => {
    // R11 — la lista no se mueve para quien no pide nada.
    const pagina = await listar(consulta({ pageSize: 25, search: LOCAL }));

    expect([...pagina.nombres].sort()).toEqual(pagina.nombres);
  });
});

describe('dos filtros a la vez: una fila sale solo si cumple LOS DOS (R15)', () => {
  const LOCAL = token();
  const DIA_CREACION = '2031-05-10';

  beforeAll(async () => {
    await sembrar([
      {
        name: `${MARCA} ${LOCAL} las dos`,
        createdAt: new Date(`${DIA_CREACION}T08:00:00.000Z`),
        updatedAt: new Date('2031-06-01T08:00:00.000Z'),
      },
      {
        name: `${MARCA} ${LOCAL} solo creacion`,
        createdAt: new Date(`${DIA_CREACION}T09:00:00.000Z`),
        updatedAt: new Date('2031-07-01T08:00:00.000Z'),
      },
      {
        name: `${MARCA} ${LOCAL} solo edicion`,
        createdAt: new Date('2031-05-11T09:00:00.000Z'),
        updatedAt: new Date('2031-06-02T08:00:00.000Z'),
      },
    ]);
  });

  it('exigir rango de creacion Y rango de edicion deja solo la que cumple ambos', async () => {
    // R15 — conjuncion explicita (`AND`): tres filas sembradas, una sola cumple los dos rangos.
    // Los dos filtros se pasan al ADAPTADOR, que es quien los traduce; que hoy el contrato solo
    // declare `createdAt` filtrable es cosa de la lista blanca, no de la traduccion.
    const pagina = await listar(
      consulta({
        pageSize: 25,
        search: LOCAL,
        filters: {
          createdAt: { kind: 'dateRange', from: DIA_CREACION, to: DIA_CREACION },
          updatedAt: { kind: 'dateRange', from: '2031-06-01', to: '2031-06-01' },
        },
      }),
    );

    expect(pagina.nombres).toEqual([`${MARCA} ${LOCAL} las dos`]);
    expect(pagina.total).toBe(1);
  });
});

describe('desempate estable por identificador (R10)', () => {
  const LOCAL = token();
  const MISMO_INSTANTE = new Date('2031-04-01T12:00:00.000Z');

  beforeAll(async () => {
    await sembrar(
      [1, 2, 3, 4].map((n) => ({
        name: `${MARCA} ${LOCAL} ${String(n)}`,
        createdAt: MISMO_INSTANTE,
      })),
    );
  });

  it('cuatro filas con el MISMO valor de orden no se repiten ni se pierden entre paginas', async () => {
    // R10 — el nombre de receta viva es unico, pero `createdAt` no: sin el desempate por `id`,
    // dos filas empatadas pueden intercambiarse entre consultas y una acabaria saliendo dos
    // veces —o ninguna—.
    const vistos: string[] = [];
    for (const page of [1, 2]) {
      const pagina = await listar(
        consulta({
          page,
          pageSize: 2,
          search: LOCAL,
          sort: { columnId: 'createdAt', direction: 'asc' },
        }),
      );
      vistos.push(...pagina.ids);
    }

    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
    // Todas empatan en `createdAt`: lo unico que puede ordenarlas es el desempate por `id`.
    expect([...vistos].sort()).toEqual(vistos);
  });
});

describe('la busqueda ignora acentos y mayusculas (R16, R18, R19)', () => {
  const LOCAL = token();

  beforeAll(async () => {
    await sembrar([
      { name: `Solución Buffer pH 7 ${MARCA} ${LOCAL}` },
      { name: `Agua destilada ${MARCA} ${LOCAL}` },
      { name: `Hipoclorito de sodio 5% ${MARCA} ${LOCAL}` },
    ]);
  });

  it('buscar «solucion» encuentra «Solución Buffer pH 7»', async () => {
    // R18 + R19 — el termino se normaliza con `normalizeRecipeName`, la MISMA funcion que
    // escribio `name_normalized` y la misma con la que el modulo compara nombres para la
    // unicidad: buscar y comparar no discrepan.
    const pagina = await listar(consulta({ pageSize: 25, search: `solucion buffer` }));

    expect(pagina.nombres).toEqual([`Solución Buffer pH 7 ${MARCA} ${LOCAL}`]);
    expect(pagina.total).toBe(1);
  });

  it('la busqueda es por SUBCADENA: una palabra del medio encuentra el nombre compuesto', async () => {
    // R16 + decision cerrada de `pg_trgm` (via A): bajar a prefijo habria roto esto en silencio.
    const pagina = await listar(consulta({ pageSize: 25, search: 'sodio' }));

    expect(pagina.nombres).toContain(`Hipoclorito de sodio 5% ${MARCA} ${LOCAL}`);
  });
});

describe('el borrado logico no sale del listado, filtre lo que filtre (R7)', () => {
  const LOCAL = token();

  it('una fila borrada que cumple el filtro sigue sin aparecer y no cuenta en el total', async () => {
    // R7 — `deleted_at IS NULL` va SIEMPRE en el `where`, y `deletedAt` no es consultable.
    await sembrar([
      { name: `${MARCA} ${LOCAL} viva`, createdAt: new Date('2031-08-01T10:00:00.000Z') },
      {
        name: `${MARCA} ${LOCAL} muerta`,
        createdAt: new Date('2031-08-01T11:00:00.000Z'),
        deletedAt: new Date(),
      },
    ]);

    const pagina = await listar(
      consulta({
        pageSize: 25,
        search: LOCAL,
        filters: { createdAt: { kind: 'dateRange', from: '2031-08-01', to: '2031-08-01' } },
      }),
    );

    expect(pagina.nombres).toEqual([`${MARCA} ${LOCAL} viva`]);
    expect(pagina.total).toBe(1);
  });
});

describe('el rango de fechas se compara en UTC, con los dos extremos inclusivos', () => {
  const LOCAL = token();
  const DIA = '2031-03-10';

  it('incluye el primer y el ultimo instante del dia en UTC, y excluye el dia siguiente', async () => {
    // Decision cerrada del 2026-09-04 (manda sobre `design.md > 3.3`): `from` es 00:00:00.000Z
    // del dia y `to` es el FINAL del dia, implementado como `< 00:00:00Z del dia siguiente`
    // para no perder las marcas con microsegundos por encima del ultimo milisegundo.
    await sembrar([
      { name: `${MARCA} ${LOCAL} borde inicial`, createdAt: new Date(`${DIA}T00:00:00.000Z`) },
      { name: `${MARCA} ${LOCAL} borde final`, createdAt: new Date(`${DIA}T23:59:59.999Z`) },
      { name: `${MARCA} ${LOCAL} dia siguiente`, createdAt: new Date('2031-03-11T00:00:00.000Z') },
      { name: `${MARCA} ${LOCAL} dia anterior`, createdAt: new Date('2031-03-09T23:59:59.999Z') },
    ]);

    const pagina = await listar(
      consulta({
        pageSize: 25,
        search: LOCAL,
        filters: { createdAt: { kind: 'dateRange', from: DIA, to: DIA } },
      }),
    );

    expect([...pagina.nombres].sort()).toEqual(
      [`${MARCA} ${LOCAL} borde final`, `${MARCA} ${LOCAL} borde inicial`].sort(),
    );
    expect(pagina.total).toBe(2);
  });
});
