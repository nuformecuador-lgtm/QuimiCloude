import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

/** Mismos limites que la transaccion de `pedidos`: el Finalizar consume material dentro. */
export function withExecutionTransaction<T>(
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(run, { maxWait: 10_000, timeout: 30_000 });
}
