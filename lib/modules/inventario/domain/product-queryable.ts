// lib/modules/inventario/domain/product-queryable.ts
/**
 * Lista blanca del listado de PRODUCTOS. Lo que no este aqui se trata como si no existiera:
 * `sanitize` lo omite y la consulta no falla.
 *
 * Lo que NO puede estar, y por que:
 *   - `deletedAt`: el borrado logico no se consulta, en ninguna tabla. `sanitizeListQuery` lo
 *     omite ademas por su cuenta aunque alguien lo anadiera aqui.
 *   - `nameNormalized`: es el COMO se busca, no un campo que se pida. La busqueda entra por
 *     `search`, no por un filtro de texto sobre la columna normalizada.
 *   - `imagePath`: no se ordena ni se filtra por una ruta de archivo.
 *   - `unitId`: no es columna DE ELECCION del listado -la unidad se lee junto al nombre, no se
 *     filtra por ella-. Filtrar por unidad seria un `where` anidado sobre otra tabla, que nadie
 *     pidio.
 */

import type { ListQueryable } from './list-query';
import { PRODUCT_TYPE_VALUES } from './product-type';

export const PRODUCT_QUERYABLE: ListQueryable = {
  sortable: ['name', 'stock', 'qtyAlert', 'createdAt', 'updatedAt'],
  filterable: {
    stock: 'numberRange',
    qtyAlert: 'numberRange',
    createdAt: 'dateRange',
    type: 'select',
  },
  searchable: true,
} as const satisfies ListQueryable & { filterable: { type: 'select' } };

export { PRODUCT_TYPE_VALUES };
