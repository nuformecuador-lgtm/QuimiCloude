import type { ProductId } from './product-catalog';

/** Lo que otro modulo puede saber de un envase con presentacion fija. */
export type PackagingRef = {
  readonly id: ProductId;
  readonly name: string;
  readonly presentationId: string;
  readonly presentationName: string;
  /** Contenido vigente de la presentacion, en `unitId`; `null` si no lo declara. */
  readonly content: string | null;
  /** Unidad de la presentacion, no la del stock del envase. */
  readonly unitId: string;
  /** Disponible en envases. */
  readonly available: string;
};

export type PackagingCostingBatch = {
  readonly productId: ProductId;
  /** Costo de un envase. */
  readonly unitCost: string;
  /** Disponible del lote, en envases, mayor que cero. */
  readonly available: string;
};

/**
 * Lo implementa un adaptador driven de `inventario` y lo cablea `lib/composition`. Solo devuelve
 * envases vivos, de la empresa y con presentacion fija: cualquier otro id simplemente no viene.
 * Con `excludeOrderId`, lo que ese pedido tiene apartado cuenta como disponible.
 */
export interface PackagingCatalog {
  findRefs(
    ids: readonly ProductId[],
    companyId: string,
    options?: { readonly excludeOrderId?: string },
  ): Promise<readonly PackagingRef[]>;

  /** Lotes con disponible mayor que cero y con costo de los envases pedidos. */
  findCostingBatches(
    ids: readonly ProductId[],
    companyId: string,
    options?: { readonly excludeOrderId?: string },
  ): Promise<readonly PackagingCostingBatch[]>;
}
