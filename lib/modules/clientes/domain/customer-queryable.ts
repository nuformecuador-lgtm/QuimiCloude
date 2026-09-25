// lib/modules/clientes/domain/customer-queryable.ts
/**
 * Lista blanca del listado de clientes (R28). Lo que no este aqui se omite sin romper la
 * consulta (R27). Ninguna forma normalizada esta declarada: no son ordenables ni filtrables
 * (R47).
 */

import type { ListQueryable } from './list-query';

export const CUSTOMER_QUERYABLE: ListQueryable = {
  sortable: ['firstNames', 'lastNames', 'city', 'createdAt', 'updatedAt'],
  filterable: { city: 'text', createdAt: 'dateRange' },
  searchable: true,
};
