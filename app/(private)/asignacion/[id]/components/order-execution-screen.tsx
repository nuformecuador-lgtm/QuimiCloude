'use client';

import { useActionState, useRef, useState } from 'react';

import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog';
import { OrderDistributionLabel } from '@/components/shared/order-distribution-label';
import { StepReader } from '@/components/shared/step-reader';
import { clampStepPosition } from '@/components/shared/step-reader/step-reader';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import type { StartedOrderExecution } from '@/lib/modules/asignaciones';
import {
  finishAssignedOrderAction,
  recordStepMoveAction,
  type FinishAssignedOrderResult,
} from '@/lib/modules/asignaciones/adapters/driving/order-execution-actions';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
import { exactDecimalTitle, formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

import { OrderCancelDialog } from './order-cancel-dialog';
import { OrderExecutionLines } from './order-execution-lines';
import { OrderExecutionTools } from './order-execution-tools';

/**
 * El recorrido completo de la pantalla: monta `StepReader` por props y termina en
 * Finalizar. No hay ningun control de edicion: la receta, sus pasos y sus
 * lineas se leen tal cual llegaron.
 *
 * `finishAssignedOrderAction` termina, en el servidor, con una redireccion a la lista de pedidos
 * asignados: el camino feliz de esta pantalla nunca resuelve, la navegacion ocurre en el
 * servidor.
 */

export const ORDER_EXECUTION_SCREEN_TESTID = 'order-execution-screen';
export const ORDER_EXECUTION_FINISH_ERROR_TESTID = 'order-execution-finish-error';
export const ORDER_EXECUTION_FINISH_FORM_TESTID = 'order-execution-finish-form';
export const ORDER_EXECUTION_ORDER_ID_FIELD = 'orderId';
export const ORDER_EXECUTION_STEP_POSITION_FIELD = 'stepPosition';
export const ORDER_EXECUTION_TITLE_TESTID = 'order-execution-title';
export const ORDER_EXECUTION_RECIPE_MISSING_TESTID = 'order-execution-recipe-missing';
export const ORDER_EXECUTION_MATERIALS_TESTID = 'order-execution-materials';
export const ORDER_EXECUTION_MATERIALS_DIVIDER_TESTID = 'order-execution-materials-divider';
export const ORDER_EXECUTION_ORDER_QUANTITY_TESTID = 'order-execution-order-quantity';
export const ORDER_EXECUTION_PRESENTATION_TESTID = 'order-execution-presentation';
export const ORDER_EXECUTION_FINISH_DIALOG_TESTID = 'order-execution-finish-dialog';
export const ORDER_EXECUTION_FINISH_CONFIRM_TESTID = 'order-execution-finish-confirm';

export const ORDER_EXECUTION_FINISH_CONFIRM_TEXTS = {
  title: '¿Terminar el pedido?',
  description: 'Terminar el pedido no se puede deshacer.',
  cancel: 'Cancelar',
  confirm: 'Terminar',
} as const;

const RECIPE_MISSING_TEXT = 'Esta receta esta dada de baja.';
const ORDER_QUANTITY_LABEL = 'Pedido';
const MIN_STEP_SECONDS = 5;

type FinishFormState = { readonly status: 'idle' } | FinishAssignedOrderResult;

const INITIAL_STATE: FinishFormState = { status: 'idle' };
/** `finishAssignedOrderAction` ignora su primer parametro (ver su propia firma): cualquier valor
 *  del tipo que espera sirve para adaptar el estado local, que ademas admite `'idle'`. */
const IGNORED_PREV_STATE: FinishAssignedOrderResult = { status: 'success' };

type StepChange = { readonly direction: 'advance' | 'go_back'; readonly position: number };

/** Con la receta dada de baja el titulo queda solo con el numero: el aviso va aparte. */
export function formatOrderExecutionTitle(numberText: string, recipeName: string | null): string {
  return recipeName === null ? numberText : `${numberText} - ${recipeName}`;
}

export type OrderExecutionScreenProps = {
  readonly execution: StartedOrderExecution;
};

export function OrderExecutionScreen({ execution }: OrderExecutionScreenProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stepPosition, setStepPosition] = useState(() =>
    clampStepPosition(execution.resumeStepPosition, execution.steps.length),
  );
  // Encadenadas para que lleguen en el orden de los clics; un fallo se pierde sin avisar.
  const stepMoves = useRef<Promise<void>>(Promise.resolve());
  const [state, formAction] = useActionState<FinishFormState, FormData>(
    (_previous, formData) => finishAssignedOrderAction(IGNORED_PREV_STATE, formData),
    INITIAL_STATE,
  );

  const error = state.status === 'error' ? state : undefined;

  function handleStepChange({ direction, position }: StepChange) {
    setStepPosition(position);
    stepMoves.current = stepMoves.current
      .then(() => recordStepMoveAction({ orderId: execution.orderId, direction, stepPosition: position }))
      .then(
        () => undefined,
        () => undefined,
      );
  }
  const title = formatOrderExecutionTitle(execution.numberText, execution.recipeName);

  return (
    <div className="flex min-h-dvh flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-2xl font-semibold" data-testid={ORDER_EXECUTION_TITLE_TESTID}>
          {title}
        </h1>
        <OrderCancelDialog orderId={execution.orderId} stepPosition={stepPosition} />
      </div>

      <p
        className="text-base font-medium"
        data-testid={ORDER_EXECUTION_ORDER_QUANTITY_TESTID}
        title={exactDecimalTitle(execution.orderQuantity)}
      >
        {ORDER_QUANTITY_LABEL} {formatDecimalDisplay(execution.orderQuantity)}
        {execution.unitLabel === null ? null : ` ${execution.unitLabel}`}
      </p>

      {execution.recipeName === null ? (
        <p
          className="text-base text-muted-foreground"
          data-testid={ORDER_EXECUTION_RECIPE_MISSING_TESTID}
        >
          {RECIPE_MISSING_TEXT}
        </p>
      ) : null}

      <p className="text-base text-muted-foreground" data-testid={ORDER_EXECUTION_PRESENTATION_TESTID}>
        Presentación: <OrderDistributionLabel lines={execution.presentationLines} />
      </p>

      <Card data-testid={ORDER_EXECUTION_MATERIALS_TESTID}>
        <CardContent className="flex flex-col gap-4">
          <OrderExecutionLines lines={execution.lines} />
          {/* OrderExecutionTools no pinta nada sin herramientas: el divisor quedaria colgando. */}
          {execution.tools.length > 0 ? (
            <Separator data-testid={ORDER_EXECUTION_MATERIALS_DIVIDER_TESTID} />
          ) : null}
          <OrderExecutionTools tools={execution.tools} />
        </CardContent>
      </Card>

      <div data-testid={ORDER_EXECUTION_SCREEN_TESTID}>
        <StepReader
          steps={execution.steps}
          title={title}
          onFinish={() => setConfirmOpen(true)}
          minStepSeconds={MIN_STEP_SECONDS}
          mode="ejecucion"
          initialStepPosition={execution.resumeStepPosition ?? 1}
          onStepChange={handleStepChange}
        />
      </div>

      <form ref={formRef} action={formAction} data-testid={ORDER_EXECUTION_FINISH_FORM_TESTID}>
        <input
          type="hidden"
          name={ORDER_EXECUTION_ORDER_ID_FIELD}
          defaultValue={execution.orderId}
        />
        <input
          type="hidden"
          name={ORDER_EXECUTION_STEP_POSITION_FIELD}
          value={stepPosition ?? ''}
        />
      </form>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => formRef.current?.requestSubmit()}
        texts={ORDER_EXECUTION_FINISH_CONFIRM_TEXTS}
        testId={ORDER_EXECUTION_FINISH_DIALOG_TESTID}
        confirmTestId={ORDER_EXECUTION_FINISH_CONFIRM_TESTID}
      />

      {error !== undefined ? (
        <div
          role="alert"
          data-testid={ORDER_EXECUTION_FINISH_ERROR_TESTID}
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={error} />
          ) : (
            <p>{error.message}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
