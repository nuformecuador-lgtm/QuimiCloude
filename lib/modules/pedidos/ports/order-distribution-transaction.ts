import type { OrderWriteRepository } from './order-write-repository';

/**
 * Transaccion CORTA propia de `updateOrderPresentationLines`: a diferencia
 * de `OrderUnitOfWork`, NO abre el ambito compartido con `inventario` -este caso de uso no toca
 * material, receta ni reserva-. Da acceso al MISMO repositorio de escritura que usa
 * el resto del modulo, atado a la transaccion que abre el adaptador.
 */
export interface OrderDistributionTransaction {
  run<T>(work: (orders: OrderWriteRepository) => Promise<T>): Promise<T>;
}
