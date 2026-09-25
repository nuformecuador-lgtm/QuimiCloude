import type { Prisma } from '@prisma/client';

import type { CustomerScope } from '../../../domain/customer-scope';

/**
 * La unica definicion de «de la empresa» del modulo `clientes`; toda consulta o escritura de
 * `customers` la toma de aqui para que no haya copias que diverjan (R12).
 *
 * Las lecturas la componen al mismo nivel que `deletedAt: null`, nunca fundida con la busqueda
 * ni con los filtros. El `count` del listado usa literalmente el mismo objeto `where` que el
 * `findMany`. Toda escritura sobre una fila existente la lleva en el `where`, no en un `if`
 * posterior sobre la fila leida.
 *
 * Sin ninguna excepcion, y sin ninguna lista de excepciones.
 */
function companyScope(scope: CustomerScope): { companyId: string } {
  return { companyId: scope.companyId };
}

/** Envoltura solo para tipar: delega en `companyScope`. Hay UNA definicion, no dos. */
export function customerCompanyScope(scope: CustomerScope): Prisma.CustomerWhereInput {
  return companyScope(scope);
}

/**
 * La misma definicion para una escritura: en un `WhereInput` la columna es opcional y puede ser
 * un filtro, asi que no sirve para parametrizar el `data` de un `create`.
 */
export function companyScopeColumns(scope: CustomerScope): { readonly companyId: string } {
  return companyScope(scope);
}
