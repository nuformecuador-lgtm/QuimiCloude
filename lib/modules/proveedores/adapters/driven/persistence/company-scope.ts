import type { Prisma } from '@prisma/client';

import type { SupplierScope } from '../../../domain/supplier-scope';

/**
 * La unica definicion de «de la empresa» del modulo `proveedores`; toda consulta o escritura
 * de `suppliers` y de `supplier_catalog_lines` la toma de aqui para que no haya copias que
 * diverjan.
 *
 * - Las lecturas la componen al mismo nivel que `deletedAt: null`, nunca fundida con la
 *   busqueda ni con los filtros: en `buildSupplierWhere` y en `buildCatalogLineWhere` hay un
 *   `nameNormalized: { contains }` y un `AND` de filtros, y meter el ambito ahi dentro
 *   dejaria que un termino de busqueda ampliara lo visible mas alla de la propia empresa.
 * - El `count` de cada listado usa LITERALMENTE el mismo objeto `where` que su `findMany`: un
 *   `total` calculado con un ambito distinto describiria un conjunto que la pagina no muestra.
 * - Toda escritura que apunte a una fila existente la lleva en el `where`, no en un `if`
 *   posterior sobre la fila leida: leer primero y decidir despues ya es haber leido lo ajeno.
 * - `isSupplierAlive` TAMBIEN la compone, aunque no sea metodo de ningun puerto: es la funcion
 *   que comparten el alta de linea y el listado del catalogo, y sin ambito un proveedor de
 *   otra empresa seguiria pareciendo «vivo».
 * - Las dos altas escriben la columna desde `companyScopeColumns`, no desde este `where`: en
 *   los `WhereInput` de Prisma la columna es un filtro OPCIONAL, y algo opcional no sirve para
 *   parametrizar el `data` de un `create`.
 * - El arrastre del catalogo en la baja del proveedor conserva su transaccion interactiva y su
 *   `now` unico, y lleva el ambito en las DOS sentencias.
 *
 * No hay ninguna excepcion a esta regla, y no se crea ninguna lista de excepciones.
 */
function companyScope(scope: SupplierScope): { companyId: string } {
  return { companyId: scope.companyId };
}

/** Envoltura solo para tipar: delega en `companyScope`. Hay UNA definicion, no tres. */
export function supplierCompanyScope(scope: SupplierScope): Prisma.SupplierWhereInput {
  return companyScope(scope);
}

/** Envoltura solo para tipar: delega en `companyScope`. Hay UNA definicion, no tres. */
export function catalogLineCompanyScope(scope: SupplierScope): Prisma.SupplierCatalogLineWhereInput {
  return companyScope(scope);
}

/**
 * La misma definicion para una escritura: en un `WhereInput` la columna es opcional y puede
 * ser un filtro (`UuidFilter | string`), asi que no sirve para parametrizar el `data` de un
 * `create`.
 */
export function companyScopeColumns(scope: SupplierScope): { readonly companyId: string } {
  return companyScope(scope);
}
