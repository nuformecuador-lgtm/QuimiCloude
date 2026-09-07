import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { normalizeUnitName } from '../../../domain/unit-name';

import { normalizedSearchCondition } from './list-query-sql';

import type { ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { UnitRef } from '../../../domain/unit-catalog';

/**
 * Implementa `UnitRepository` (`ports/unit-repository.ts`) con Prisma: las DOS lecturas del
 * listado, la del catalogo entero (R40 de QC-32, R28) y la paginada (R29).
 *
 * `Unit` NO tiene `deleted_at` (no hay borrado logico de unidades): no hay ningun filtro de vida
 * que aplicar en el `where`, y no se inventa uno que la tabla no tiene.
 *
 * NO es `unit-catalog-prisma.ts` (`findRefs`, resolver ids conocidos para `recetas`): ese
 * adaptador es de otro puerto y no se toca.
 */

const UNIT_SELECT = { id: true, name: true, symbol: true } satisfies Prisma.UnitSelect;

type UnitRow = Prisma.UnitGetPayload<{ select: typeof UNIT_SELECT }>;

function toUnitRef(row: UnitRow): UnitRef {
  return { id: row.id, name: row.name, symbol: row.symbol };
}

/**
 * Desempate ESTABLE por identificador (R10). El nombre de unidad es unico, pero `symbol` -que
 * `UNIT_QUERYABLE` declara ordenable- no lo es y ademas es ANULABLE, asi que sin un segundo
 * criterio dos unidades empatadas pueden intercambiarse -o perderse- entre paginas: el orden de
 * las filas empatadas no esta definido y Postgres puede devolverlas distinto en cada consulta.
 */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.UnitOrderByWithRelationInput;

/**
 * Orden POR DEFECTO: exactamente el de hoy, `name ASC` (R11). Se construye en CADA llamada, no
 * como constante compartida: Prisma exige un array mutable en `orderBy`, y devolver siempre la
 * misma instancia dejaria que un llamante la mutara para todos.
 */
function defaultOrderBy(): Prisma.UnitOrderByWithRelationInput[] {
  return [{ name: 'asc' }, TIE_BREAKER];
}

/**
 * `sort` del contrato -> `orderBy` de Prisma (R10, R11).
 *
 * **`symbol` es ANULABLE y sus nulos van SIEMPRE AL FINAL**, en `asc` Y en `desc`, declarado
 * explicito (`nulls: 'last'`) y NO heredado del defecto de Postgres -que los pone al final en
 * `ASC` pero al PRINCIPIO en `DESC`-. Es la decision cerrada del 2026-09-04, que manda sobre
 * `design.md > 3.3`: quien ordena por simbolo quiere ver los simbolos reales, no arrancar por
 * las unidades que no declaran ninguno.
 *
 * El `default` no puede darse por inalcanzable: `sanitizeListQuery` ya poda lo que no esta en
 * `UNIT_QUERYABLE`, pero el adaptador no puede depender de que su llamante lo haya hecho -es
 * defensa en profundidad, y mantiene R5 cierto tambien aqui-.
 */
export function unitOrderBy(sort: ListSort | null): Prisma.UnitOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'name':
      return [{ name: dir }, TIE_BREAKER];
    case 'symbol':
      return [{ symbol: { sort: dir, nulls: 'last' } }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    default:
      return defaultOrderBy();
  }
}

/**
 * `where` UNICO del listado de unidades: el mismo objeto para el `findMany` y para el `count`
 * (R14).
 *
 * **La busqueda va contra `name_normalized`** (R16, R18, R19), normalizando el termino con
 * `normalizeUnitName` -la MISMA funcion que escribio la columna y la MISMA con la que el modulo
 * compara nombres para la unicidad: R19 prohibe una segunda definicion de "mismo nombre"-. Sin
 * `mode: 'insensitive'`: la columna ya viene sin acentos ni mayusculas, y pedirlo ademas dejaria
 * fuera el indice de trigramas.
 *
 * **Ningun filtro**: `UNIT_QUERYABLE.filterable` esta vacio a proposito (no es un olvido), asi
 * que `sanitizeListQuery` poda cualquier filtro que llegue y aqui no queda nada que traducir.
 * Tampoco hay `deletedAt`: `units` no tiene borrado logico.
 */
export function buildUnitWhere(query: ListQuery): Prisma.UnitWhereInput {
  const search = normalizedSearchCondition(query.search, normalizeUnitName);
  return search === null ? {} : { nameNormalized: search };
}

/**
 * `listAll` de `UnitRepository` (R40 de QC-32, R27, R28): el catalogo ENTERO, siempre con `take`
 * -ninguna consulta sin cota-, con el orden y la busqueda del contrato aplicados. Sin `count`:
 * este modo no devuelve `total` porque no hay ventana, y contar seria una consulta de mas.
 */
export async function listUnits(limit: number, query: ListQuery): Promise<readonly UnitRef[]> {
  const rows = await prisma.unit.findMany({
    where: buildUnitWhere(query),
    orderBy: unitOrderBy(query.sort),
    select: UNIT_SELECT,
    take: limit,
  });

  return rows.map(toUnitRef);
}

/**
 * `listPage` de `UnitRepository` (R13, R14, R29). El `limit` que llega a Prisma -y el `pageSize`
 * que sale en el `Page`- es el ACOTADO que devuelve `toOffsetLimit`, nunca el `pageSize` que
 * pidio el llamante: pedir 100 se ACOTA a 25, no se rechaza, y pasarle el pedido a `buildPage`
 * dejaria un `pageSize` y un `totalPages` mentirosos aunque el `LIMIT` de SQL fuera correcto.
 *
 * ORDEN Y BUSQUEDA VAN AL MOTOR, nunca a la pagina ya traida (R13), y `total` sale de un `count`
 * con el MISMO `where` que el `findMany` (R14) -literalmente la misma constante-.
 */
export async function listUnitsPage(query: ListQuery): Promise<Page<UnitRef>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildUnitWhere(query);

  const [rows, total] = await Promise.all([
    prisma.unit.findMany({
      where,
      orderBy: unitOrderBy(query.sort),
      select: UNIT_SELECT,
      skip: offset,
      take: limit,
    }),
    prisma.unit.count({ where }),
  ]);

  return buildPage(rows.map(toUnitRef), total, query.page, limit);
}
