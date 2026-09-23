export type ProductBatchView = {
  readonly id: string;
  readonly lot: string;
  readonly stock: number;
  /** Unidad de la presentacion del lote; `null` cuando el lote no tiene presentacion (MACHINE). */
  readonly unitId: string | null;
  readonly purchaseDate: string;
  readonly expiryDate: string | null;
};
