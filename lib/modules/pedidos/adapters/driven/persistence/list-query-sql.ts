// lib/modules/pedidos/adapters/driven/persistence/list-query-sql.ts
/**
 * Traduccion del contrato generico de consulta (`domain/list-query.ts`) a las condiciones que
 * Prisma entiende (QC-57 T20). Vive en `adapters/driven/` porque es EXACTAMENTE lo que el
 * dominio no puede saber: `gte`/`lte`/`in`/`contains` son vocabulario de la base.
 *
 * Es una COPIA deliberada de la gemela de `inventario` y de la de `proveedores`, por el mismo
 * motivo por el que `domain/list-query.ts` esta duplicado cinco veces (`design.md > 2.1`):
 * importar de otro modulo por una ruta profunda es justo lo que
 * `docs/architecture.md > La regla de dependencias` prohibe. Si cambia una, cambian las tres.
 *
 * `normalizedSearchCondition` se conserva sin que el adaptador de pedidos la llame: las tres
 * copias son la misma, y podarla aqui las haria divergir sin que nada avise. `orders` no tiene
 * columna de nombre propia -la busqueda de pedidos casa por el nombre de la receta, resuelto en
 * otro modulo-, asi que aqui no hay nada sobre lo que aplicarla.
 *
 * Las funciones son PURAS y devuelven objetos planos; no tocan el cliente Prisma. Por eso se
 * pueden probar sin base, aunque quien demuestra que la traduccion dice lo que se cree es el
 * test de INTEGRACION.
 *
 * DOS SEMANTICAS DECIDIDAS QUE HAY QUE LEER DESPACIO:
 *
 *   - **`dateRange` se compara en UTC, con los DOS extremos inclusivos** (decision cerrada del
 *     2026-09-04, que manda sobre `design.md > 3.3`, donde figuraba como posicion por defecto).
 *     Las columnas son `timestamptz` y QC-55 emite `YYYY-MM-DD` sin huso. `from` es
 *     `00:00:00.000Z` de ese dia; `to` es **el final del dia**, y se implementa como
 *     `< 00:00:00.000Z del dia siguiente` -no como `<= 23:59:59.999Z`- para que ninguna marca de
 *     tiempo de ese dia con microsegundos por encima del ultimo milisegundo se quede fuera:
 *     Postgres guarda `timestamptz` con precision de microsegundo, asi que `23:59:59.9995Z`
 *     existe y `<=` la perderia. Consecuencia aceptada por escrito en la decision: un pedido
 *     creado el dia 4 a las 19:00 de Bogota cae en el dia 5 en UTC.
 *   - **`select` con lista VACIA es filtro AUSENTE**, no «ningun resultado» (`design.md > 3.3`):
 *     una lista vacia es «no he elegido nada», y devolver cero filas por eso es la trampa
 *     hermana de la que R5 evita.
 */

/** Condicion de rango de una columna numerica. `null` en un extremo = sin cota por ese lado. */
export type NumberRangeCondition = { gte?: number; lte?: number };

/** Condicion de rango de una columna `timestamptz`. `lt` -no `lte`- por lo explicado arriba. */
export type DateRangeCondition = { gte?: Date; lt?: Date };

/** Condicion de pertenencia a un conjunto cerrado de valores. La lista se COPIA a un array
 *  mutable porque el tipo `in` de Prisma lo exige; el contrato de entrada sigue siendo
 *  `readonly` y esta copia no lo modifica. */
export type SelectCondition = { in: string[] };

/** Condicion de subcadena insensible a mayusculas sobre una columna en crudo. */
export type TextCondition = { contains: string; mode: 'insensitive' };

const MIDNIGHT_UTC = 'T00:00:00.000Z';
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Extremos INCLUSIVOS (`design.md > 3.3`). Devuelve `null` cuando el rango no acota nada -los
 * dos extremos nulos-, para que el llamante no meta una clave vacia en el `where`.
 */
export function numberRangeCondition(
  min: number | null,
  max: number | null,
): NumberRangeCondition | null {
  if (min === null && max === null) return null;
  return {
    ...(min === null ? {} : { gte: min }),
    ...(max === null ? {} : { lte: max }),
  };
}

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

/** Lista vacia = filtro ausente (`null`), no «ningun resultado». */
export function selectCondition(values: readonly string[]): SelectCondition | null {
  return values.length === 0 ? null : { in: [...values] };
}

/**
 * Filtro de TEXTO sobre una columna en crudo: `contains` con `mode: 'insensitive'`, que es lo que
 * hace hoy la busqueda de productos (`design.md > 3.3`). No se usa para la BUSQUEDA (`search`):
 * esa va contra la columna normalizada, sin `mode`, porque la columna ya esta normalizada.
 */
export function textCondition(value: string): TextCondition | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : { contains: trimmed, mode: 'insensitive' };
}

/**
 * Termino de busqueda -> condicion contra la columna normalizada (R16, R18, R19). El termino se
 * normaliza con la MISMA funcion que escribio la columna -la que se pasa por parametro-: es lo
 * que hace que buscar «solucion» encuentre «Solución Buffer pH 7» y que buscar y comparar dejen
 * de discrepar. Sin `mode: 'insensitive'`: la columna ya viene sin acentos ni mayusculas.
 *
 * Un termino que se normaliza a vacio -«%%%», o solo espacios- es AUSENCIA de busqueda (R20):
 * `contains: ''` casaria con todo, que es lo mismo, pero devolver `null` deja el `where` limpio.
 */
export function normalizedSearchCondition(
  search: string,
  normalize: (value: string) => string,
): { contains: string } | null {
  const normalized = normalize(search);
  return normalized === '' ? null : { contains: normalized };
}
