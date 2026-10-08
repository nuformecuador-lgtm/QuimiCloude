import type { NewExecutionEntry } from '../domain/execution-entry';

/** Registro de solo anexar: una anotacion no se corrige ni se borra. */
export interface ExecutionLogRepository {
  append(entry: NewExecutionEntry): Promise<void>;
  /** La posicion de la ultima anotacion con posicion de ese pedido en esa empresa, o `null`. */
  findLastStepPosition(companyId: string, orderId: string): Promise<number | null>;
}
