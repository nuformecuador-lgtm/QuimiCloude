import type { FinishedGoodsIntake, MaterialReservations, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import type { OrderWriteRepository } from './order-write-repository';

/**
 * Lo que ve el trabajo que corre DENTRO de la transaccion compartida: el repositorio de
 * escritura de `pedidos`, las reservas de `inventario`, el lector de contenido de receta, la
 * entrada de producto terminado y las lecturas de productos y unidades con las que se convierte
 * la necesidad, todos atados al MISMO cliente transaccional.
 * Ninguno abre su propia transaccion ni pide una segunda conexion mientras esta se mantiene
 * abierta.
 */
export type OrderTransactionScope = {
  readonly orders: OrderWriteRepository;
  readonly reservations: MaterialReservations;
  readonly recipes: Pick<RecipeCatalog, 'findExecutionContentById'>;
  readonly finishedGoods: FinishedGoodsIntake;
  readonly products: Pick<ProductCatalog, 'findRefs'>;
  readonly units: Pick<UnitCatalog, 'findRefs' | 'findMassVolumeBridge'>;
};

/**
 * Puerto de la unidad de trabajo de `pedidos`: crear, editar, cancelar, borrar y entregar
 * escriben en dos modulos a la vez, y las dos escrituras pasan o ninguna. La abre un
 * adaptador driven de `pedidos`; `inventario` no sabe que existe.
 */
export interface OrderUnitOfWork {
  run<T>(work: (scope: OrderTransactionScope) => Promise<T>): Promise<T>;
}
