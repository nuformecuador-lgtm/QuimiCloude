// lib/modules/recetas/adapters/driven/persistence/list-query-sql.ts
/**
 * Traduccion del contrato generico de consulta (`domain/list-query.ts`) a las condiciones que
 * Prisma entiende (QC-57 T16). Vive en `adapters/driven/` porque es EXACTAMENTE lo que el
 * dominio no puede saber: `gte`/`lt`/`contains` son vocabulario de la base.
 *
 * **Replicado a proposito desde `inventario`**, igual que `domain/list-query.ts` y que las
 * cuatro `normalize*Name`: el dominio de un modulo no puede importar de otro modulo por ruta
 * profunda y un adaptador driven tampoco (`docs/architecture.md > La regla de dependencias`; de
 * otro modulo solo se importa su CONTRATO, y estos helpers son detalle de persistencia, no
 * contrato). Aqui solo se replica lo que `RECIPE_QUERYABLE` declara -un `dateRange` y la
 * busqueda-: las otras dos formas (`numberRange`, `select`) no tienen ningun campo que traducir
 * en `recipes`, y copiarlas seria codigo muerto. Cuando `recipes` declare uno, se replica
 * entonces, con el mismo criterio y el mismo cuerpo que en `inventario`.
 *
 * LA SEMANTICA DECIDIDA QUE HAY QUE LEER DESPACIO:
 *
 *   - **`dateRange` se compara en UTC, con los DOS extremos inclusivos** (decision cerrada del
 *     2026-09-04, que manda sobre `design.md > 3.3`, donde figuraba como posicion por defecto).
 *     Las columnas son `timestamptz` y QC-55 emite `YYYY-MM-DD` sin huso. `from` es
 *     `00:00:00.000Z` de ese dia; `to` es **el final del dia**, y se implementa como
 *     `< 00:00:00.000Z del dia siguiente` -no como `<= 23:59:59.999Z`- para que ninguna marca de
 *     tiempo de ese dia con microsegundos por encima del ultimo milisegundo se quede fuera:
 *     Postgres guarda `timestamptz` con precision de microsegundo, asi que `23:59:59.9995Z`
 *     existe y `<=` la perderia.
 */

/** Condicion de rango de una columna `timestamptz`. `lt` -no `lte`- por lo explicado arriba. */
export type DateRangeCondition = { gte?: Date; lt?: Date };

const MIDNIGHT_UTC = 'T00:00:00.000Z';
const MILLISECONDS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` -> instante UTC de las 00:00, o `null` si la fecha no es una fecha. */
function startOfDayUtc(day: string | null): Date | null {
  if (day === null) return null;
  const parsed = new Date(`${day}${MIDNIGHT_UTC}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * `dateRange` -> `{ gte, lt }` en UTC. Una fecha ilegible se trata como «sin cota por ese lado»:
 * el contrato no puede fallar por lo que le manden (R5), y una excepcion aqui convertiria un
 * parametro raro en un error 500.
 */
export function dateRangeCondition(
  from: string | null,
  to: string | null,
): DateRangeCondition | null {
  const start = startOfDayUtc(from);
  const endDay = startOfDayUtc(to);
  if (start === null && endDay === null) return null;
  return {
    ...(start === null ? {} : { gte: start }),
    // El dia siguiente a las 00:00Z: `to` INCLUSIVO hasta el ultimo microsegundo del dia.
    ...(endDay === null ? {} : { lt: new Date(endDay.getTime() + MILLISECONDS_PER_DAY) }),
  };
}

/**
 * Termino de busqueda -> condicion contra la columna normalizada (R16, R18, R19). El termino se
 * normaliza con la MISMA funcion que escribio la columna -la que se pasa por parametro-: es lo
 * que hace que buscar «solucion» encuentre «Solución Buffer pH 7» y que buscar y comparar dejen
 * de discrepar. Sin `mode: 'insensitive'`: la columna ya viene sin acentos ni mayusculas.
 *
 * Un termino que se normaliza a vacio -«%%%», o solo espacios- es AUSENCIA de busqueda (R20).
 */
export function normalizedSearchCondition(
  search: string,
  normalize: (value: string) => string,
): { contains: string } | null {
  const normalized = normalize(search);
  return normalized === '' ? null : { contains: normalized };
}
