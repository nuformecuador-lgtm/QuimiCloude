'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { StepReader } from '@/components/shared/step-reader';
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import type { AssignedOrderExecutionView } from '@/lib/modules/asignaciones';
import {
  finishAssignedOrderAction,
  type FinishAssignedOrderResult,
} from '@/lib/modules/asignaciones/adapters/driving/order-execution-actions';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

import { OrderExecutionLines } from './order-execution-lines';
import { OrderScaleBanner } from './order-scale-banner';

/**
 * El recorrido completo de la pantalla: monta `StepReader` por props y termina en
 * Finalizar. No hay ningun control de edicion: la receta, sus pasos y sus
 * lineas se leen tal cual llegaron.
 *
 * `finishAssignedOrderAction` termina, en el servidor, con `redirect(ASSIGNED_ORDERS_ROUTE)`. La
 * navegacion de aqui es un refuerzo del lado del cliente para el caso en que la operacion
 * resuelve `{ status: 'success' }` sin haber saltado esa redireccion.
 */

export const ORDER_EXECUTION_SCREEN_TESTID = 'order-execution-screen';
export const ORDER_EXECUTION_CONFIRMATION_TESTID = 'order-execution-confirmation';
export const ORDER_EXECUTION_FINISH_ERROR_TESTID = 'order-execution-finish-error';
export const ORDER_EXECUTION_FINISH_FORM_TESTID = 'order-execution-finish-form';
export const ORDER_EXECUTION_ORDER_ID_FIELD = 'orderId';
export const ORDER_EXECUTION_TITLE_TESTID = 'order-execution-title';
export const ORDER_EXECUTION_RECIPE_NAME_TESTID = 'order-execution-recipe-name';

const CONFIRMATION_TEXT = 'Pedido finalizado. Volviendo a la lista de pedidos asignados…';
const RECIPE_MISSING_TEXT = 'Esta receta esta dada de baja.';

type FinishFormState = { readonly status: 'idle' } | FinishAssignedOrderResult;

const INITIAL_STATE: FinishFormState = { status: 'idle' };
/** `finishAssignedOrderAction` ignora su primer parametro (ver su propia firma): cualquier valor
 *  del tipo que espera sirve para adaptar el estado local, que ademas admite `'idle'`. */
const IGNORED_PREV_STATE: FinishAssignedOrderResult = { status: 'success' };

export type OrderExecutionScreenProps = {
  readonly execution: AssignedOrderExecutionView;
};

export function OrderExecutionScreen({ execution }: OrderExecutionScreenProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<FinishFormState, FormData>(
    (_previous, formData) => finishAssignedOrderAction(IGNORED_PREV_STATE, formData),
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status !== 'success') return;
    router.push(ASSIGNED_ORDERS_ROUTE);
  }, [state, router]);

  const error = state.status === 'error' ? state : undefined;
  const confirmed = state.status === 'success';

  return (
    <div className="flex min-h-dvh flex-col gap-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold" data-testid={ORDER_EXECUTION_TITLE_TESTID}>
        {execution.numberText}
      </h1>

      <OrderScaleBanner
        orderQuantity={execution.orderQuantity}
        recipeBaseQuantity={execution.recipeBaseQuantity}
        scaleFactorText={execution.scaleFactorText}
      />

      <p
        className="text-base text-muted-foreground"
        data-testid={ORDER_EXECUTION_RECIPE_NAME_TESTID}
      >
        {execution.recipeName ?? RECIPE_MISSING_TEXT}
      </p>

      <OrderExecutionLines lines={execution.lines} />

      <div data-testid={ORDER_EXECUTION_SCREEN_TESTID}>
        <StepReader
          steps={execution.steps}
          title={execution.numberText}
          onFinish={() => formRef.current?.requestSubmit()}
        />
      </div>

      <form ref={formRef} action={formAction} data-testid={ORDER_EXECUTION_FINISH_FORM_TESTID}>
        <input
          type="hidden"
          name={ORDER_EXECUTION_ORDER_ID_FIELD}
          defaultValue={execution.orderId}
        />
      </form>

      {confirmed ? (
        <p
          role="status"
          data-testid={ORDER_EXECUTION_CONFIRMATION_TESTID}
          className="text-base font-medium"
        >
          {CONFIRMATION_TEXT}
        </p>
      ) : null}

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
