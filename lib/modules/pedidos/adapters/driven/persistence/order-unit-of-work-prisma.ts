import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { CREATE_ORDER_MAX_ATTEMPTS, isDuplicateOrderNumber } from './order-prisma';

/**
 * `withOrderTransaction`: abre la transaccion compartida con `maxWait`/`timeout` explicitos -el
 * defecto de Prisma es demasiado corto para un alta que puede reintentar entera- y, si el
 * `INSERT` del correlativo choca contra `orders_company_year_sequence_key`, reintenta la unidad
 * COMPLETA en una transaccion NUEVA: la que aborto por el choque no admite ni una sentencia
 * mas, asi que el reintento no puede vivir dentro de ella (mismo tope que `createOrder`).
 *
 * `lib/composition` cablea `OrderUnitOfWork.run` sobre esta funcion, pasandole un `work` que
 * construye `OrderTransactionScope` con `tx`: ni la composicion ni el puerto nombran Prisma, y
 * este es el UNICO archivo de `pedidos` que abre la transaccion compartida con `inventario`.
 */
export async function withOrderTransaction<T>(
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(run, { maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      if (!isDuplicateOrderNumber(error) || attempt >= CREATE_ORDER_MAX_ATTEMPTS) throw error;
    }
  }
}
