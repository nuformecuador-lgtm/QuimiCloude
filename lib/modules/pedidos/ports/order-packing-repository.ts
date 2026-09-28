import type { OrderScope } from '../domain/order-scope';

/**
 * Puerto de Comenzar el empaque: UN `UPDATE` condicional con ambito de empresa, fuera de la
 * unidad de trabajo compartida con `inventario` -no toca material ni producto terminado-.
 *
 * Terminar el empaque (R17-R21) YA NO vive aqui (T14): da de alta un lote por linea del
 * reparto, y por eso corre DENTRO de `OrderUnitOfWork` -`OrderWriteRepository.finishPackingAlive`
 * y `.findPresentationLinesForFinish`, `ports/order-write-repository.ts`-, para que ese alta y
 * el `UPDATE` del estado compartan la MISMA transaccion.
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
}
