import type { FinishedGoodsReturn } from '@/lib/modules/inventario';

import type { OrderDeliveryVoidRepository } from './order-delivery-void-repository';
import type { OrderWriteRepository } from './order-write-repository';

/** Lo que ve una anulacion de entrega dentro de la transaccion compartida con `inventario`. Va
 *  aparte de los otros ambitos de transaccion para no obligar a sus dobles a construirla. */
export type OrderDeliveryVoidTransactionScope = {
  readonly orders: Pick<OrderWriteRepository, 'lockAliveById' | 'setStatus'>;
  readonly voids: OrderDeliveryVoidRepository;
  readonly finishedGoods: FinishedGoodsReturn;
};

export interface OrderDeliveryVoidUnitOfWork {
  run<T>(work: (scope: OrderDeliveryVoidTransactionScope) => Promise<T>): Promise<T>;
}
