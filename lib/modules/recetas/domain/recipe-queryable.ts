// lib/modules/recetas/domain/recipe-queryable.ts
/**
 * Lista blanca del listado de RECETAS (R4, `design.md > 5`). Lo que no este aqui se omite sin
 * romper la consulta (R5).
 *
 * Lo que NO puede estar: `deletedAt` (R7), `nameNormalized` (es el COMO de la busqueda),
 * `imagePath` y `steps` -ni una ruta de archivo ni el cuerpo de la receta se ordenan ni se
 * filtran-.
 */

import type { ListQueryable } from './list-query';

export const RECIPE_QUERYABLE: ListQueryable = {
  sortable: ['name', 'createdAt', 'updatedAt'],
  filterable: { createdAt: 'dateRange' },
  searchable: true,
};
