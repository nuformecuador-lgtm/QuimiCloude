/**
 * El aviso que `inventario` da cuando sube la existencia de una empresa: el alta de un lote, sea
 * el primero de un producto o uno adicional, y un ajuste positivo. `inventario` no puede importar
 * `pedidos` (ciclo), asi que declara aqui el hueco y `lib/composition` lo ata a la revision de los
 * pedidos bloqueados.
 */
export interface StockIncreaseListener {
  /** Se llama despues de confirmar el movimiento. No debe lanzar: quien lo implementa resuelve sus
   *  propios fallos, porque el movimiento ya quedo escrito. */
  onStockIncreased(input: { readonly companyId: string; readonly now: Date }): Promise<void>;
}
