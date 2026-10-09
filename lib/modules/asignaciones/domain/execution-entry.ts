export const EXECUTION_ACTIONS = [
  'start',
  'resume',
  'advance',
  'go_back',
  'cancel',
  'finish',
  'pack_start',
  'pack_finish',
] as const;

export type ExecutionAction = (typeof EXECUTION_ACTIONS)[number];

type PackingAction = 'pack_start' | 'pack_finish';

type StepAction = Exclude<ExecutionAction, 'cancel' | PackingAction>;

type Base = {
  readonly companyId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly occurredAt: Date;
};

/** El empaque no recorre los pasos de la receta: su anotacion va siempre sin posicion. */
export type NewExecutionEntry =
  | (Base & { readonly action: StepAction; readonly stepPosition: number | null })
  | (Base & { readonly action: 'cancel'; readonly stepPosition: number | null; readonly reason: string })
  | (Base & { readonly action: PackingAction; readonly stepPosition: null });

/** Una anotacion leida del registro. `id` desempata dos anotaciones con el mismo instante. */
export type ExecutionEntryRecord = {
  readonly id: string;
  readonly orderId: string;
  readonly userId: string;
  readonly action: ExecutionAction;
  readonly stepPosition: number | null;
  readonly reason: string | null;
  readonly occurredAt: Date;
};

/** Lo que devuelven las escrituras de `pedidos` que corren dentro de la transaccion de ejecucion. */
export type ExecutionWriteOutcome = string | { readonly kind: string };

type ExecutionSuccess = 'ok' | { readonly kind: 'ok' };

/**
 * Unico criterio de exito para las escrituras dentro de la transaccion: Terminar empaque devuelve
 * un objeto, y comparar contra el literal `'ok'` abortaria ese exito.
 */
export function isExecutionSuccess<T extends ExecutionWriteOutcome>(
  outcome: T,
): outcome is Extract<T, ExecutionSuccess> {
  return typeof outcome === 'string' ? outcome === 'ok' : outcome.kind === 'ok';
}

/**
 * Se lanza dentro de la transaccion ante un desenlace que no es exito, para que se deshaga lo
 * que `pedidos` ya hubiera escrito; quien abrio la transaccion la atrapa al salir y la traduce.
 */
export class ExecutionAbortedError extends Error {
  constructor(readonly outcome: ExecutionWriteOutcome) {
    super(
      `desenlace '${typeof outcome === 'string' ? outcome : outcome.kind}' aborto la transaccion de ejecucion`,
    );
    this.name = 'ExecutionAbortedError';
  }
}
