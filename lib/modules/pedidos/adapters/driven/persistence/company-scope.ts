import type { Prisma } from '@prisma/client';

import type { OrderScope } from '../../../domain/order-scope';

/**
 * La unica definicion de «de la empresa» del modulo `pedidos`; todas las consultas de `orders` la
 * toman de aqui para que no haya copias que diverjan.
 *
 * - Las lecturas la componen con `AND`, nunca fundida con los filtros: un `OR` al mismo nivel que
 *   `companyId` dejaria que un filtro ampliara lo visible.
 * - Las escrituras sobre una fila existente la llevan en el `where`, no en un `if` posterior: leer
 *   primero y decidir despues ya es haber leido lo ajeno.
 * - El alta, en SQL crudo, usa `companyScopeColumns(scope).companyId` como parametro (`::uuid`) en
 *   la columna que escribe y en el subselect del maximo del correlativo: si el maximo se leyera de
 *   otra empresa, sus pedidos moverian esta serie.
 *
 * Filtra, no autoriza: el permiso ya lo comprobo el caso de uso con `requirePermission`.
 */
function companyScope(scope: OrderScope): { companyId: string } {
  return { companyId: scope.companyId };
}

/**
 * Las dos envolturas delegan en `companyScope` y existen solo para tipar. `Prisma.OrderWhereInput`
 * hace que componer el ambito sobre otra tabla no compile.
 */
export function orderCompanyScope(scope: OrderScope): Prisma.OrderWhereInput {
  return companyScope(scope);
}

/**
 * La misma definicion para una escritura: en `OrderWhereInput` `companyId` es opcional y puede ser un
 * filtro, asi que no sirve para parametrizar el SQL del alta.
 */
export function companyScopeColumns(scope: OrderScope): { readonly companyId: string } {
  return companyScope(scope);
}
