import type { ProductId } from './product-catalog';
import type { UnitId } from '@/lib/modules/unidades';

/** Un lote con existencia, visto desde fuera de `inventario` para costear. `stock` es `Int`
 *  en la base; `unitCost` viaja como cadena decimal; `unitId` es el de la PRESENTACION del
 *  lote; `purchaseDate` en `YYYY-MM-DD` (la columna es `@db.Date`, sin hora). */
export type CostingBatch = {
  readonly productId: ProductId;
  readonly lot: string;
  readonly stock: number;
  readonly unitCost: string;
  readonly unitId: UnitId;
  readonly purchaseDate: string;
};
