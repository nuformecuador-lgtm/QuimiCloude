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
  /** Transaccion corta con `SELECT ... FOR UPDATE` de la fila, conteo del reparto en una
   *  sentencia aparte y solo entonces el `UPDATE` (`design.md > 4.5`, R10, R48): `'ok'` si el
   *  `UPDATE` mueve la fila; `'without_distribution'` si esta `POR_EMPACAR` sin ninguna linea de
   *  reparto; si no, `'not_found'`, `'already_mine'`, `'taken'` o `'not_packable'` segun la fila
   *  bloqueada. */
  startPackingAlive(
    id: string,
    packerId: string,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'already_mine' | 'taken' | 'not_packable' | 'not_found' | 'without_distribution'>;

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
