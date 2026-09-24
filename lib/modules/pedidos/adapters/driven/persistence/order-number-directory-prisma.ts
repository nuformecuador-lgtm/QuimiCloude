import { prisma } from '@/lib/shared/db/prisma';

import { formatOrderNumber } from '../../../domain/order-number';

import { orderCompanyScope } from './company-scope';

/**
 * Implementa `OrderNumberDirectory` de `inventario` (el hueco que `inventario` declara para no
 * importar `pedidos` y cerrar un ciclo): el numero visible de un pedido, para el historial de un
 * lote.
 *
 * SIN `deletedAt: null` a proposito: el historial de un lote no pierde su pedido porque alguien
 * lo borre, cancele o entregue despues, asi que este directorio INCLUYE cancelados, entregados y
 * borrados.
 */
export async function findOrderNumberTextsByIds(
  companyId: string,
  orderIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>();
  if (orderIds.length === 0) return result;

  const rows = await prisma.order.findMany({
    where: { AND: [orderCompanyScope({ companyId }), { id: { in: [...orderIds] } }] },
    select: { id: true, orderYear: true, orderSequence: true },
  });

  for (const row of rows) {
    result.set(row.id, formatOrderNumber({ year: row.orderYear, sequence: row.orderSequence }));
  }
  return result;
}
