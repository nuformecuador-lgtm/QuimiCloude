import type { FinishedGoodsDispatch } from '@/lib/modules/inventario';

import type { OrderDeliveryRepository } from './order-delivery-repository';
import type { OrderWriteRepository } from './order-write-repository';

/** Lo que ve una entrega dentro de la transaccion compartida con `inventario`. Va aparte de
 *  `OrderTransactionScope` para no obligar a todos sus dobles a construir la entrega. */
export type OrderDeliveryTransactionScope = {
  readonly orders: Pick<OrderWriteRepository, 'lockAliveById' | 'findPresentationLinesForFinish' | 'setStatus'>;
  readonly deliveries: OrderDeliveryRepository;
  readonly finishedGoods: FinishedGoodsDispatch;
};

export interface OrderDeliveryUnitOfWork {
  run<T>(work: (scope: OrderDeliveryTransactionScope) => Promise<T>): Promise<T>;
}
