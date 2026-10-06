import type { UnitId } from '@/lib/modules/unidades';

import type { PackagedStockBatch, PackagedStockEntry } from './packaged-stock';
import type { ProductView } from './product-view';

/** El correlativo de un pedido tal como vive en la base; el texto visible lo compone `pedidos`. */
export type FinishedOrderNumber = {
  readonly year: number;
  readonly sequence: number;
};

/** Un lote de producto terminado con lo que su asiento `production` dice del pedido. */
export type FinishedStockBatch = PackagedStockBatch & {
  readonly productId: string;
};

/**
 * Lo que el repositorio devuelve por fila de la pestana, sin componer: los lotes de la fila y
 * los productos a los que pertenecen. `order` agrupa por el pedido del asiento `production`;
 * `withoutOrder` es un producto con lotes que no entraron por ningun pedido.
 */
export type FinishedStockGroup =
  | {
      readonly kind: 'order';
      readonly orderId: string;
      readonly orderNumber: FinishedOrderNumber;
      readonly recipeName: string | null;
      readonly products: readonly ProductView[];
      readonly batches: readonly FinishedStockBatch[];
    }
  | {
      readonly kind: 'withoutOrder';
      readonly product: ProductView;
      readonly batches: readonly FinishedStockBatch[];
    };

/** Un producto terminado dentro de una fila: lo que hace falta para editarlo y darlo de baja. */
export type FinishedStockProductLine = {
  readonly product: ProductView;
  /** Existencia de este producto en los lotes de ESTA fila, en `product.unitId`. */
  readonly stock: string;
  /** Esa misma existencia contada en envases; `null` en la fila sin pedido o si no se pudo contar. */
  readonly packagedStock: readonly PackagedStockEntry[] | null;
};

export type FinishedOrderStockRow = {
  readonly kind: 'order';
  readonly key: string;
  readonly orderId: string;
  readonly orderNumber: FinishedOrderNumber;
  readonly numberText: string;
  /** Nombre actual de la receta del pedido; `null` si la receta ya no se encuentra. */
  readonly recipeName: string | null;
  /** Existencia del pedido por presentacion; `null` si algun lote no se pudo contar en envases. */
  readonly packagedStock: readonly PackagedStockEntry[] | null;
  readonly products: readonly FinishedStockProductLine[];
};

export type FinishedWithoutOrderStockRow = {
  readonly kind: 'withoutOrder';
  readonly key: string;
  readonly productId: string;
  /** Existencia de los lotes sin pedido del producto, en `unitId`. */
  readonly stock: string;
  readonly unitId: UnitId | null;
  readonly products: readonly [FinishedStockProductLine];
};

export type FinishedStockRow = FinishedOrderStockRow | FinishedWithoutOrderStockRow;
