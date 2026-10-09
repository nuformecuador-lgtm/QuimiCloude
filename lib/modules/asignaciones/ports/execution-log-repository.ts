import type { ExecutionEntryRecord, NewExecutionEntry } from '../domain/execution-entry';

export type ExecutedOrdersFilter = {
  readonly userId?: string;
  /** Inclusivo. */
  readonly occurredFrom?: Date;
  /** Exclusivo. */
  readonly occurredBefore?: Date;
};

/** Registro de solo anexar: una anotacion no se corrige ni se borra. */
export interface ExecutionLogRepository {
  append(entry: NewExecutionEntry): Promise<void>;
  /** La posicion de la ultima anotacion con posicion de ese pedido en esa empresa, o `null`. */
  findLastStepPosition(companyId: string, orderId: string): Promise<number | null>;
  /** Ids distintos de los pedidos con alguna anotacion que cumpla el filtro. Sin orden prometido. */
  listExecutedOrderIds(companyId: string, filter: ExecutedOrdersFilter): Promise<readonly string[]>;
  /** Todas las anotaciones de esos pedidos, por pedido y luego por instante e `id` ascendentes. */
  listEntriesForOrders(companyId: string, orderIds: readonly string[]): Promise<readonly ExecutionEntryRecord[]>;
  /** Ids distintos de las personas con alguna anotacion en la empresa. */
  listUserIdsWithEntries(companyId: string): Promise<readonly string[]>;
}
