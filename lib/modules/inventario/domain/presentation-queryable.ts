// lib/modules/inventario/domain/presentation-queryable.ts
/**
 * Lista blanca del listado de PRESENTACIONES (R4, `design.md > 5`). Lo que no este aqui se omite
 * sin romper la consulta (R5).
 *
 * `deletedAt` no esta y no puede estar (R7); `nameNormalized` tampoco, porque es el COMO de la
 * busqueda y no un campo que se pida.
 */

import type { ListQueryable } from './list-query';

export const PRESENTATION_QUERYABLE: ListQueryable = {
  sortable: ['name', 'createdAt', 'updatedAt'],
  filterable: { createdAt: 'dateRange' },
  searchable: true,
};
