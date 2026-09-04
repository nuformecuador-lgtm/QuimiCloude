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
 */

import type { ListQueryable } from './list-query';

export const PRODUCT_QUERYABLE: ListQueryable = {
  /**
   * `presentationName` NO es una columna de `products`: es un JOIN a `presentations`, que el
   * adaptador traduce a `orderBy: { presentation: { name: dir } }`. Se declara ordenable porque
   * la pantalla ya muestra esa columna; **no** es filtrable por texto -para eso esta
   * `presentationId`, que es un `select` y usa el indice que ya existe-.
   */
  sortable: ['name', 'presentationName', 'stock', 'qtyAlert', 'createdAt', 'updatedAt'],
  filterable: {
    presentationId: 'select',
    unitId: 'select',
    stock: 'numberRange',
    qtyAlert: 'numberRange',
    createdAt: 'dateRange',
  },
  searchable: true,
};
