/**
 * Traduccion del contrato generico de consulta (`domain/list-query.ts`) a las condiciones que
 * Prisma entiende. Vive en `adapters/driven/` porque es lo que el dominio no puede saber:
 * `gte`/`lte`/`contains` son vocabulario de la base.
 *
 * Se copia SOLO la funcion que este modulo usa (`dateRangeCondition`), no el archivo entero de
 * `proveedores`: copiar tambien `numberRange`, `select`, `textCondition` o
 * `normalizedSearchCondition` dejaria codigo muerto en un modulo que no los usa (regla de
 * dependencias entre modulos: no se importa de `proveedores` por una ruta profunda).
 *
 * `dateRange` se compara en UTC, con los DOS extremos inclusivos (mismo criterio que el resto
 * del repositorio): `from` es la medianoche de ese dia y `to` es el `lt` de la medianoche del
 * dia siguiente, para no perder ninguna marca de tiempo de ese dia por debajo del milisegundo.
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
 * el contrato no puede fallar por lo que le manden, y una excepcion aqui convertiria un
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
    ...(endDay === null ? {} : { lt: new Date(endDay.getTime() + MILLISECONDS_PER_DAY) }),
  };
}
