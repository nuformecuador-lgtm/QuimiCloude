export type FinishedGoodsReturnInput = {
  readonly companyId: string;
  readonly orderId: string;
  readonly orderDeliveryVoidId: string;
  /** Una por linea de entrega anulada; `quantity` es la de esa linea, decimal(14,4), positiva. */
  readonly lines: readonly { readonly batchId: string; readonly quantity: string }[];
  readonly actorId: string;
  readonly now: Date;
};

export type FinishedGoodsReturnOutcome =
  | { readonly kind: 'returned' }
  | { readonly kind: 'batch_not_found'; readonly batchId: string };

/** Lo implementa un driven de `inventario` sobre la transaccion de quien llama. */
export interface FinishedGoodsReturn {
  returnForDeliveryVoid(input: FinishedGoodsReturnInput): Promise<FinishedGoodsReturnOutcome>;
}

/** Lectura fuera de transaccion: el codigo de lote de cada id. Un id ajeno o inexistente no vuelve. */
export interface BatchLotDirectory {
  findLots(batchIds: readonly string[], companyId: string): Promise<ReadonlyMap<string, string>>;
}
