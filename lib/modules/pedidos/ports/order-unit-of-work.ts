import type { MaterialReservations } from '@/lib/modules/inventario';

import type { OrderWriteRepository } from './order-write-repository';

/**
 * Lo que ve el trabajo que corre DENTRO de la transaccion compartida: el repositorio de
 * escritura de `pedidos` y las reservas de `inventario`, los dos atados al MISMO cliente
 * transaccional. Ninguno de los dos abre su propia transaccion.
 */
export type OrderTransactionScope = {
  readonly orders: OrderWriteRepository;
  readonly reservations: MaterialReservations;
};

/**
 * Puerto de la unidad de trabajo de `pedidos`: crear, editar, cancelar, borrar y entregar
 * escriben en dos modulos a la vez, y las dos escrituras pasan o ninguna. La abre un
 * adaptador driven de `pedidos`; `inventario` no sabe que existe.
 */
export interface OrderUnitOfWork {
  run<T>(work: (scope: OrderTransactionScope) => Promise<T>): Promise<T>;
}
