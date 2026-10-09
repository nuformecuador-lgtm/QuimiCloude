import type { OrderScope } from '../domain/order-scope';

/**
 * Puerto de Comenzar y Terminar el acondicionamiento: cada metodo es UN `UPDATE` condicional con
 * ambito de empresa, fuera de la unidad de trabajo compartida con `inventario`, porque ninguno
 * toca material ni producto terminado.
 *
 * `scope: OrderScope` es SIEMPRE el ultimo parametro (`tests/guards/guard-ambito-empresa-pedidos.test.ts`).
 */
export interface OrderConditioningRepository {
  /** `POR_ACONDICIONAR -> EN_ACONDICIONAMIENTO` con `conditionerId` como quien acondiciona.
   *  `'already_mine'` es el mismo acondicionador sobre su propio `EN_ACONDICIONAMIENTO`, sin
   *  escribir; `'taken'`, ese estado a nombre de otro; `'not_conditionable'`, cualquier otro
   *  estado; `'not_found'`, no existe, esta de baja o es de otra empresa. */
  startConditioningAlive(
    id: string,
    conditionerId: string,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'already_mine' | 'taken' | 'not_conditionable' | 'not_found'>;

  /** `EN_ACONDICIONAMIENTO -> TERMINADO` con `finishedAt = now`, solo si `conditionerId` es quien
   *  lo acondiciona. `'not_conditioner'` es ese estado a nombre de otro; `'not_conditionable'`,
   *  cualquier otro estado; `'not_found'`, igual que arriba. */
  finishConditioningAlive(
    id: string,
    conditionerId: string,
    now: Date,
    scope: OrderScope,
  ): Promise<'ok' | 'not_conditioner' | 'not_conditionable' | 'not_found'>;
}
