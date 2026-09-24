export type ProductBatchView = {
  readonly id: string;
  readonly lot: string;
  readonly stock: string;
  /** Unidad de la presentacion del lote; `null` cuando el lote no tiene presentacion (MACHINE). */
  readonly unitId: string | null;
  readonly purchaseDate: string;
  readonly expiryDate: string | null;
  /** Lo apartado por pedidos vivos en este lote. Opcional: solo lo rellena
   *  `findBatchesOfAliveProduct`; las demas lecturas no la traen. */
  readonly reserved?: string;
  /** Su existencia menos su apartado, nunca por debajo de cero. Misma condicion que `reserved`. */
  readonly available?: string;
  /** El apartado supera la existencia. Misma condicion que `reserved`. */
  readonly overReserved?: boolean;
};
