import type { ProductId } from './product-catalog';
import type { UnitId } from '@/lib/modules/unidades';

/** Un lote con disponible, visto desde fuera de `inventario` para costear. `stock`, `unitCost`
 *  y `available` viajan como cadena decimal; `unitId` es el de la PRESENTACION del lote;
 *  `purchaseDate` en `YYYY-MM-DD` (la columna es `@db.Date`, sin hora). `available` es
 *  `stock` menos lo apartado en el libro de reservas, nunca por debajo de cero. */
export type CostingBatch = {
  readonly productId: ProductId;
  readonly lot: string;
  readonly stock: string;
  readonly unitCost: string;
  readonly unitId: UnitId;
  readonly purchaseDate: string;
  readonly available: string;
};
