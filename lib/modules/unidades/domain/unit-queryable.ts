// lib/modules/unidades/domain/unit-queryable.ts
/**
 * Lista blanca del listado de UNIDADES (R4, R27, `design.md > 5`). Lo que no este aqui se omite
 * sin romper la consulta (R5).
 *
 * **Sin ningun filtro declarado**: son cinco unidades sembradas y la pantalla no ofrece ninguno.
 * `filterable` vacio no es un olvido; es la lista blanca diciendo que aqui no se filtra, y
 * cualquier filtro que llegue se omite por R5.
 *
 * `deletedAt` no esta -y la tabla ni siquiera tiene borrado logico-; `nameNormalized` tampoco.
 */

import type { ListQueryable } from './list-query';

export const UNIT_QUERYABLE: ListQueryable = {
  sortable: ['name', 'symbol', 'createdAt'],
  filterable: {},
  searchable: true,
};
