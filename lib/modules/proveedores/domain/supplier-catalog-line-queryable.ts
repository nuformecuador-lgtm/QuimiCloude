// lib/modules/proveedores/domain/supplier-catalog-line-queryable.ts
/**
 * Lista blanca del listado del CATALOGO DE UN PROVEEDOR (R4, `design.md > 5`). Lo que no este
 * aqui se omite sin romper la consulta (R5).
 *
 * `cost` y `minPurchase` son `Decimal(14,4)` en la base y el `numberRange` del contrato viaja como
 * `number`: la conversion a `Prisma.Decimal` es del adaptador driven, el dominio nunca compara
 * importes en coma flotante (`design.md > 5`, `docs/architecture.md > Anti-patrones`).
 *
 * `deletedAt` no esta y no puede estar (R7); `nameNormalized` tampoco.
 */

import type { ListQueryable } from './list-query';

export const SUPPLIER_CATALOG_LINE_QUERYABLE: ListQueryable = {
  sortable: ['name', 'cost', 'minPurchase', 'deliveryTime', 'createdAt'],
  filterable: {
    presentationId: 'select',
    unitId: 'select',
    cost: 'numberRange',
    deliveryTime: 'numberRange',
  },
  searchable: true,
};
