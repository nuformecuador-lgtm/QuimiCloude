// lib/modules/proveedores/domain/list-query.ts
/**
 * Contrato de consulta de lista del modulo `proveedores` (QC-57 T1, `design.md > 2.1` y `> 3.1`).
 *
 * **Este archivo esta DUPLICADO, a proposito, en los cinco modulos con listado**
 * (`inventario`, `recetas`, `proveedores`, `unidades`, `pedidos`). No es un descuido: es la
 * decision cerrada 13 de `requirements.md`. El dominio NO puede importar `lib/shared/**`
 * (`docs/architecture.md > La regla de dependencias`), asi que lo que se comparte es la FORMA
 * del contrato, no el archivo. Las alternativas -un modulo `listados` o un
 * `lib/shared/list-query.ts`- estan descartadas por escrito en `design.md > 2.2` y `> 2.3`.
 *
 * Lo que impide que las cinco copias diverjan no es un import: es
 * `tests/guards/guard-contrato-listados.test.ts` (R32), que somete a los cinco esquemas la misma
 * bateria canonica y exige el mismo veredicto y la misma salida saneada. **Si tocas este archivo,
 * tocas los cinco.**
 *
 * Dependencias permitidas aqui: SOLO `zod` (R31). Ni `lib/shared/**`, ni `@prisma/client`, ni
 * `next/*`, ni `components/**`.
 */

import { z } from 'zod';

/** Direccion de orden. Una sola columna a la vez (R9). */
export type SortDirection = 'asc' | 'desc';

/**
 * El orden pedido: que campo y en que direccion (R1, R9). `columnId` **es el nombre del campo**
 * en `camelCase` -la grafia del cliente Prisma-; traducirlo a `snake_case` es del adaptador
 * driven, el unico que puede conocer la base (`design.md > 3.1`).
 */
export type ListSort = {
  readonly columnId: string;
  readonly direction: SortDirection;
};

/**
 * Las CUATRO formas de filtro que el contrato entiende, y ninguna mas (R12). Union discriminada
 * por `kind`: un quinto `kind` no discrimina y muere en el `parse`. Copia campo a campo de
 * `DataTableFilterValue` (QC-55), que es quien las emite, para que nadie tenga que traducir.
 */
export type ListFilterValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'numberRange'; readonly min: number | null; readonly max: number | null }
  | { readonly kind: 'select'; readonly values: readonly string[] }
  | { readonly kind: 'dateRange'; readonly from: string | null; readonly to: string | null };

/** El nombre de una de las cuatro formas de filtro. Es lo que una lista blanca declara por campo. */
export type ListFilterKind = ListFilterValue['kind'];

/**
 * La consulta completa (R1, R3): la misma forma para los siete listados. Anadir un campo
 * consultable NO cambia esta forma -no aparece ninguna propiedad nueva-, solo la lista blanca.
 */
export type ListQuery = {
  readonly page: number;
  /** El defecto 10 y el tope 25 los pone el adaptador con `lib/shared/pagination` (R29). */
  readonly pageSize?: number;
  /** UNA columna o nada (R9). El contrato no admite una lista de ordenes. */
  readonly sort: ListSort | null;
  readonly filters: Readonly<Record<string, ListFilterValue>>;
  /** `''` = sin busqueda (R20). */
  readonly search: string;
};

/**
 * La lista blanca de un listado (R4): que campos suyos son ordenables, cuales filtrables y con
 * que forma cada uno, y si busca por `name`. Lo que no este declarado aqui **no existe** para el
 * contrato (R5). `deletedAt` no puede estar en ninguna (R7) y `sanitize` lo omite ademas por su
 * cuenta, aunque alguien lo declarase.
 */
export type ListQueryable = {
  readonly sortable: readonly string[];
  readonly filterable: Readonly<Record<string, ListFilterKind>>;
  /** `false` en pedidos: no tiene columna `name`, la busqueda se omite (R17). */
  readonly searchable: boolean;
};

/**
 * Campos que NUNCA son consultables, este declarado lo que este declarado (R7). Es defensa
 * explicita, no confianza en que las siete listas blancas esten bien escritas: un `deletedAt`
 * consultable dejaria sin efecto el borrado logico de QC-4 y QC-20.
 */
const NEVER_QUERYABLE: readonly string[] = ['deletedAt'];

/** Tope de la busqueda: corta por lo sano una consulta absurda antes de llegar a la base. */
const SEARCH_MAX_LENGTH = 120;

const sortSchema = z.strictObject({
  columnId: z.string(),
  direction: z.enum(['asc', 'desc']),
});

const filterValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), value: z.string() }),
  z.strictObject({
    kind: z.literal('numberRange'),
    min: z.number().nullable(),
    max: z.number().nullable(),
  }),
  z.strictObject({ kind: z.literal('select'), values: z.array(z.string()).readonly() }),
  z.strictObject({
    kind: z.literal('dateRange'),
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
]);

/**
 * Fabrica del esquema zod del contrato (R30). Valida la FORMA, no el contenido: que campos son
 * consultables lo decide `sanitize` con la lista blanca, porque un campo no declarado **no puede
 * hacer fallar la consulta** (R5) y un esquema solo sabe rechazar.
 *
 * Es una fabrica y no una constante para que cada caso de uso declare el suyo en su propio
 * modulo sin compartir instancia, igual que `pageQuerySchema`.
 */
export function createListQuerySchema(): z.ZodType<ListQuery, unknown> {
  return z.strictObject({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).optional(),
    sort: sortSchema.nullable().default(null),
    filters: z.record(z.string(), filterValueSchema).default({}),
    search: z.string().trim().max(SEARCH_MAX_LENGTH).default(''),
  });
}

/** Lo que `sanitize` devuelve: la consulta viva y los NOMBRES de los campos omitidos (R6). */
export type SanitizedListQuery = {
  readonly query: ListQuery;
  /**
   * Solo nombres de campo. **Nunca** el texto buscado ni el valor del filtro: podria ser PII y
   * `docs/architecture.md > Anti-patrones` prohibe registrarla (`design.md > 8`).
   */
  readonly ignored: readonly string[];
};

function isSortable(field: string, queryable: ListQueryable): boolean {
  return !NEVER_QUERYABLE.includes(field) && queryable.sortable.includes(field);
}

function declaredKind(field: string, queryable: ListQueryable): ListFilterKind | undefined {
  if (NEVER_QUERYABLE.includes(field)) return undefined;
  return Object.hasOwn(queryable.filterable, field) ? queryable.filterable[field] : undefined;
}

/**
 * Poda de la consulta contra la lista blanca (R5, R7, R8, R17). **Pura y no falla nunca**: lo que
 * no esta declarado se omite y la lista vuelve como si no se hubiera pedido, que es justo lo que
 * R5 exige. Quien avisa es el log del caso de uso, con `ignored` (R6).
 */
export function sanitizeListQuery(
  query: ListQuery,
  queryable: ListQueryable,
): SanitizedListQuery {
  const ignored: string[] = [];
  const ignore = (field: string): void => {
    if (!ignored.includes(field)) ignored.push(field);
  };

  const sort = query.sort !== null && isSortable(query.sort.columnId, queryable) ? query.sort : null;
  if (query.sort !== null && sort === null) ignore(query.sort.columnId);

  const filters: Record<string, ListFilterValue> = {};
  for (const [field, value] of Object.entries(query.filters)) {
    if (declaredKind(field, queryable) === value.kind) {
      filters[field] = value;
    } else {
      ignore(field);
    }
  }

  const searchAllowed = queryable.searchable || query.search === '';
  if (!searchAllowed) ignore('search');

  return {
    query: { ...query, sort, filters, search: searchAllowed ? query.search : '' },
    ignored,
  };
}
