import type { OrderScope } from '../domain/order-scope';

/**
 * Puerto de las dos escrituras del empaque, cada una UN `UPDATE` condicional con ambito de
 * empresa, fuera de la unidad de trabajo compartida con `inventario`: ninguna de las dos toca
 * material ni producto terminado.
 *
 * Mismo criterio de ambito que `OrderWriteRepository`: `scope: OrderScope` es SIEMPRE el ultimo
 * parametro (`tests/guards/guard-ambito-empresa-pedidos.test.ts`).
 */
export interface OrderPackingRepository {
  /** `UPDATE ... WHERE status = 'POR_EMPACAR'`: `count = 1` es `'ok'`. Si no, relee la fila para
   *  clasificar `'not_found'`, `'already_mine'`, `'taken'` o `'not_packable'`. */
  startPackingAlive(
    id: string,
    packerId: string,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'already_mine' | 'taken' | 'not_packable' | 'not_found'>;

  /** `UPDATE ... WHERE status = 'EN_EMPAQUE' AND packed_by = packerId`, con `finished_at` en la
   *  MISMA sentencia. Si no: relee para clasificar `'not_found'`, `'not_packer'` o
   *  `'not_packable'`. */
  finishPackingAlive(
    id: string,
    packerId: string,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'not_packer' | 'not_packable' | 'not_found'>;
}
