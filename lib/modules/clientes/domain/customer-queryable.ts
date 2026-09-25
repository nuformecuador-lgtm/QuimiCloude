/**
 * Lista blanca del listado de clientes. Lo que no este aqui se omite sin romper la consulta.
 * Ninguna forma normalizada esta declarada: son derivadas para buscar, no un dato de negocio
 * ordenable ni filtrable.
 */

import type { ListQueryable } from './list-query';

export const CUSTOMER_QUERYABLE: ListQueryable = {
  sortable: ['firstNames', 'lastNames', 'city', 'createdAt', 'updatedAt'],
  filterable: { city: 'text', createdAt: 'dateRange' },
  searchable: true,
};
