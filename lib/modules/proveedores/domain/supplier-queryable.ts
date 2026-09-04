// lib/modules/proveedores/domain/supplier-queryable.ts
/**
 * Lista blanca del listado de PROVEEDORES (R4, `design.md > 5`). Lo que no este aqui se omite sin
 * romper la consulta (R5).
 *
 * `deletedAt` no esta y no puede estar (R7); `nameNormalized` tampoco.
 */

import type { ListQueryable } from './list-query';

export const SUPPLIER_QUERYABLE: ListQueryable = {
  sortable: ['name', 'createdAt', 'updatedAt'],
  filterable: { createdAt: 'dateRange' },
  searchable: true,
};
