import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { normalizeUnitName } from '../../../domain/unit-name';

import { normalizedSearchCondition } from './list-query-sql';

import type { ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { UnitScope } from '../../../domain/unit-scope';
import type { UnitView } from '../../../domain/unit-view';

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

/**
 * Proyeccion del listado (QC-39 R1, R2; `design.md > 2.2`). A los tres campos de siempre se
 * suman `baseUnitId` y `factor` -la EQUIVALENCIA, que la pantalla pinta- y `companyId`, que
 * entra en el `select` pero **NO sale**: se consume aqui para derivar `isSystem` y no cruza la
 * frontera hacia el cliente (R2). Nada mas cambia en este archivo: el `where` del ambito, la
 * busqueda por `nameNormalized`, el `orderBy` con su desempate y el `count` compartido se
 * quedan literalmente iguales (R6).
 */
const UNIT_SELECT = {
  id: true,
  name: true,
  symbol: true,
  baseUnitId: true,
  factor: true,
  companyId: true,
} satisfies Prisma.UnitSelect;

type UnitRow = Prisma.UnitGetPayload<{ select: typeof UNIT_SELECT }>;

/**
 * Fila -> `UnitView` (QC-39 R1, R2).
 *
 * Dos derivaciones y ninguna decision mas:
 *   - `isSystem = row.companyId === null`, la MISMA definicion de «de sistema» que usan las
 *     escrituras del modulo; el identificador de empresa se queda aqui.
 *   - `factor` sale del `Decimal` de Prisma con `.toString()`, o sea como TEXTO decimal y nunca
 *     como coma flotante (R1). La canonicalizacion visible -quitar los ceros de relleno de
 *     `1000.0000`- es de quien lo pinta, no de la proyeccion.
 */
function toUnitView(row: UnitRow): UnitView {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    baseUnitId: row.baseUnitId,
    factor: row.factor?.toString() ?? null,
    isSystem: row.companyId === null,
  };
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
 *
 * **El `scope` es OBLIGATORIO en la firma** (QC-76 R18): un `where` del listado no se puede
 * construir sin la empresa en cuyo nombre se pregunta, asi que la consulta futura que se olvide
 * del filtro no compila, en vez de pasar verde y ensenar unidades ajenas. El ambito se compone
 * con la busqueda mediante `AND` -nunca fundiendo las dos en el mismo objeto-: `OR` y
 * `nameNormalized` al mismo nivel dejarian que un termino de busqueda ampliara lo visible.
 */
/**
 * **La UNICA definicion del ambito «de la empresa O de sistema»** (QC-76 R18, decision cerrada
 * 15). Una unidad es de sistema exactamente cuando su `company_id` es NULO (R11, R12): no hay
 * bandera que mirar, y por eso la condicion es un `OR` de dos igualdades y no un booleano.
 *
 * Se ESCRIBE AQUI UNA VEZ y se EXPORTA a proposito: toda consulta del listado la compone, y
 * quien anada una consulta nueva la reutiliza en vez de escribir un segundo `OR` que manana
 * puede divergir y ensenarle a una empresa lo que no es suyo.
 *
 * **Quien la va a reutilizar y por que no lo hace ya**: `findUnitRefs`
 * (`unit-catalog-prisma.ts`) se queda SIN ambito en esta ficha, por decision cerrada del humano
 * del 2026-09-07 (R36, decision cerrada 33). Es la unica excepcion explicita a R18 y tiene
 * destino nombrado: **QC-50**, la ficha que aisla `recetas` —su unico llamante— por empresa.
 * Cuando llegue, acota su consulta con ESTA funcion; hasta entonces el aislamiento del catalogo
 * completo vive donde esta escrito, en el listado.
 */
export function companyScopeWhere(scope: UnitScope): Prisma.UnitWhereInput {
  return { OR: [{ companyId: scope.companyId }, { companyId: null }] };
}

export function buildUnitWhere(query: ListQuery, scope: UnitScope): Prisma.UnitWhereInput {
  const search = normalizedSearchCondition(query.search, normalizeUnitName);
  const scoped = companyScopeWhere(scope);
  return search === null ? scoped : { AND: [scoped, { nameNormalized: search }] };
}

/**
 * `listAll` de `UnitRepository` (R40 de QC-32, R27, R28): el catalogo ENTERO, siempre con `take`
 * -ninguna consulta sin cota-, con el orden y la busqueda del contrato aplicados. Sin `count`:
 * este modo no devuelve `total` porque no hay ventana, y contar seria una consulta de mas.
 */
export async function listUnits(
  limit: number,
  query: ListQuery,
  scope: UnitScope,
): Promise<readonly UnitView[]> {
  const rows = await prisma.unit.findMany({
    where: buildUnitWhere(query, scope),
    orderBy: unitOrderBy(query.sort),
    select: UNIT_SELECT,
    take: limit,
  });

  return rows.map(toUnitView);
}

/**
 * `listPage` de `UnitRepository` (R13, R14, R29). El `limit` que llega a Prisma -y el `pageSize`
 * que sale en el `Page`- es el ACOTADO que devuelve `toOffsetLimit`, nunca el `pageSize` que
 * pidio el llamante: pedir 100 se ACOTA a 25, no se rechaza, y pasarle el pedido a `buildPage`
 * dejaria un `pageSize` y un `totalPages` mentirosos aunque el `LIMIT` de SQL fuera correcto.
 *
 * ORDEN Y BUSQUEDA VAN AL MOTOR, nunca a la pagina ya traida (R13), y `total` sale de un `count`
 * con el MISMO `where` que el `findMany` (R14) -literalmente la misma constante-. Desde QC-76
 * ese `where` incluye el AMBITO, y compartir el objeto es justo lo que hace que el `total`
 * cuente SOLO lo visible para la empresa (R17): un `count` con su propio `where` contaria
 * tambien las unidades ajenas y la paginacion mentiria.
 */
export async function listUnitsPage(query: ListQuery, scope: UnitScope): Promise<Page<UnitView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildUnitWhere(query, scope);

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

  return buildPage(rows.map(toUnitView), total, query.page, limit);
}
