// lib/modules/inventario/domain/product-queryable.ts
/**
 * Lista blanca del listado de PRODUCTOS (R4, `design.md > 5`). Lo que no este aqui se trata como
 * si no existiera: `sanitize` lo omite y la consulta no falla (R5).
 *
 * Lo que NO puede estar, y por que:
 *   - `deletedAt` (R7): el borrado logico no se consulta, en ninguna tabla. `sanitizeListQuery`
 *     lo omite ademas por su cuenta aunque alguien lo anadiera aqui.
 *   - `nameNormalized`: es el COMO se busca, no un campo que se pida. La busqueda entra por
 *     `search`, no por un filtro de texto sobre la columna normalizada.
 *   - `imagePath`: no se ordena ni se filtra por una ruta de archivo.
 *   - `unitId` (QC-80, R21): dejo de existir como columna de `products`, asi que no queda nada
 *     que mirar. Filtrar por la unidad DERIVADA -la de la presentacion del lote mas reciente-
 *     seria un `where` anidado sobre ese lote: otra consulta, que nadie pidio. Quitarlo es un
 *     cambio de contrato del listado, y por eso lo vigilan `tests/unit/inventario/list-query.test.ts`
 *     y `tests/guards/guard-contrato-listados.test.ts`.
 */

import type { ListQueryable } from './list-query';

export const PRODUCT_QUERYABLE: ListQueryable = {
  sortable: ['name', 'stock', 'qtyAlert', 'createdAt', 'updatedAt'],
  filterable: {
    stock: 'numberRange',
    qtyAlert: 'numberRange',
    createdAt: 'dateRange',
  },
  searchable: true,
};
