import type { OrderCancellation, OrderCatalog } from '@/lib/modules/pedidos';

import type { ConditioningTeamRepository } from './conditioning-team-repository';
import type { ExecutionLogRepository } from './execution-log-repository';

/** Solo escrituras: lo que se lee para decidir se lee antes, fuera de la transaccion. */
export type ExecutionWriters = {
  readonly orders: Pick<OrderCatalog, 'transitionAliveById'> & OrderCancellation;
  readonly packing: Pick<OrderCatalog, 'startPackingAliveById' | 'finishPackingAliveById'>;
  readonly log: ExecutionLogRepository;
  readonly conditioning: Pick<OrderCatalog, 'startConditioningAliveById'>;
  readonly team: ConditioningTeamRepository;
};

/** Lo escrito por `writers` se confirma entero o nada, y se deshace entero si `work` lanza. */
export interface ExecutionTransaction {
  run<T>(work: (writers: ExecutionWriters) => Promise<T>): Promise<T>;
}
