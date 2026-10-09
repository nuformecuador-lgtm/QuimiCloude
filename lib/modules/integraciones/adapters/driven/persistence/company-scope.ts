import type { Prisma } from '@prisma/client';

import type { IntegracionesScope } from '../../../domain/integraciones-scope';

/**
 * La única definición de «de la empresa» del módulo: toda consulta o escritura de
 * `whatsapp_connections` la toma de aquí, para que no haya copias que diverjan.
 */
function companyScope(scope: IntegracionesScope): { companyId: string } {
  return { companyId: scope.companyId };
}

export function whatsappConnectionCompanyScope(
  scope: IntegracionesScope,
): Prisma.WhatsappConnectionWhereInput {
  return companyScope(scope);
}

/** Para el `data` de un `create`: en un `WhereInput` la columna es opcional y admite un filtro. */
export function companyScopeColumns(scope: IntegracionesScope): { readonly companyId: string } {
  return companyScope(scope);
}
