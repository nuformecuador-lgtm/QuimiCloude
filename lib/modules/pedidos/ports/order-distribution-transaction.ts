import type { OrderWriteRepository } from './order-write-repository';

/**
 * Transaccion CORTA propia de `updateOrderPresentationLines` (`design.md > 4.2`): a diferencia
 * de `OrderUnitOfWork`, NO abre el ambito compartido con `inventario` -este caso de uso no toca
 * material, receta ni reserva (R30, R46)-. Da acceso al MISMO repositorio de escritura que usa
 * el resto del modulo, atado a la transaccion que abre el adaptador.
 */
export interface OrderDistributionTransaction {
  run<T>(work: (orders: OrderWriteRepository) => Promise<T>): Promise<T>;
}
