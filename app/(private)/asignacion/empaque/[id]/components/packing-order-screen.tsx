'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import type { OrderDistributionLineView, PackingOrderRow } from '@/lib/modules/asignaciones';
import {
  finishPackingAction,
  startPackingAction,
  type FinishPackingResult,
  type StartPackingResult,
} from '@/lib/modules/asignaciones/adapters/driving/order-packing-actions';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
import type { OrderStatus } from '@/lib/modules/pedidos';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';
import { exactDecimalTitle, formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

/**
 * La pantalla de un pedido de empaque. Sin control de edicion: los datos del pedido se leen tal
 * cual llegaron por props. Se compara SIEMPRE `packedById` con el actor, nunca por nombre, porque
 * dos usuarios pueden llamarse igual. Solo tres desenlaces posibles:
 *
 *   1. `POR_EMPACAR` -> boton **Comenzar**.
 *   2. `EN_EMPAQUE` a nombre del propio actor -> boton **Terminar**.
 *   3. `EN_EMPAQUE` a nombre de otro -> ningun boton, se muestra quien empaca.
 *
 * `startPackingAction` vuelve a la MISMA pantalla (revalida su ruta); `finishPackingAction`
 * termina, en el servidor, con una redireccion a «Por empacar» -su camino feliz nunca resuelve
 * aqui-.
 */

export const PACKING_ORDER_SCREEN_TESTID = 'packing-order-screen';
export const PACKING_ORDER_NUMBER_TESTID = 'packing-order-number';
export const PACKING_ORDER_RECIPE_TESTID = 'packing-order-recipe';
export const PACKING_ORDER_QUANTITY_TESTID = 'packing-order-quantity';
export const PACKING_ORDER_PRESENTATION_TESTID = 'packing-order-presentation';
export const PACKING_ORDER_PRESENTATION_LINE_TESTID = 'packing-order-presentation-line';
export const PACKING_ORDER_MISSING_DISTRIBUTION_TESTID = 'packing-order-missing-distribution';
export const PACKING_ORDER_PACKAGES_TESTID = 'packing-order-packages';
export const PACKING_ORDER_STATUS_TESTID = 'packing-order-status';
export const PACKING_ORDER_PACKER_TESTID = 'packing-order-packer';
export const PACKING_ORDER_START_FORM_TESTID = 'packing-order-start-form';
export const PACKING_ORDER_START_BUTTON_TESTID = 'packing-order-start-button';
export const PACKING_ORDER_FINISH_FORM_TESTID = 'packing-order-finish-form';
export const PACKING_ORDER_FINISH_BUTTON_TESTID = 'packing-order-finish-button';
export const PACKING_ORDER_START_ERROR_TESTID = 'packing-order-start-error';
export const PACKING_ORDER_FINISH_ERROR_TESTID = 'packing-order-finish-error';
export const PACKING_ORDER_BACK_LINK_TESTID = 'packing-order-back-link';
export const PACKING_ORDER_ID_FIELD = 'orderId';

const TOUCH_TARGET = 'min-h-11 min-w-11';
const RECIPE_MISSING_TEXT = 'Esta receta esta dada de baja.';
const MISSING_VALUE_MARK = '—';
const QUANTITY_LABEL = 'Cantidad:';
const DISTRIBUTION_LABEL = 'Reparto';
const EMPTY_DISTRIBUTION_TEXT = 'Sin presentación';
const MISSING_DISTRIBUTION_TEXT = 'Falta el reparto: lo define quien edita pedidos';
const START_LABEL = 'Comenzar';
const START_PENDING_LABEL = 'Comenzando…';
const FINISH_LABEL = 'Terminar';
const FINISH_PENDING_LABEL = 'Terminando…';
const BACK_LABEL = 'Volver a «Por empacar»';
/** `?vista=por_empacar` es el mismo nombre de parametro que `assignment-view-params.ts`. */
const BACK_HREF = `${ASSIGNED_ORDERS_ROUTE}?vista=por_empacar`;
const PACKER_UNKNOWN_TEXT = 'Lo esta empacando otra persona.';

function distributionLineText(line: OrderDistributionLineView): string {
  return `${line.packages} × ${line.packagingName ?? line.presentationName ?? MISSING_VALUE_MARK}`;
}

function packerLabel(order: PackingOrderRow): string {
  return order.packedByName === null ? PACKER_UNKNOWN_TEXT : `Lo esta empacando ${order.packedByName}.`;
}

/** Solo se pintan los dos estados que `getPackingOrder` puede devolver; cualquier otro es
 *  imposible en esta pantalla y se muestra tal cual sin tumbarla. */
function statusLabel(status: OrderStatus): string {
  if (status === 'POR_EMPACAR') return 'Por empacar';
  if (status === 'EN_EMPAQUE') return 'En empaque';
  return status;
}

const START_INITIAL_STATE: StartPackingResult = { status: 'success' };
const FINISH_INITIAL_STATE: FinishPackingResult = { status: 'success' };

export type PackingOrderScreenProps = {
  readonly order: PackingOrderRow;
  /** El id del actor de la sesion, nunca su nombre: se decide comparando `packedById`. */
  readonly actorId: string;
};

export function PackingOrderScreen({ order, actorId }: PackingOrderScreenProps) {
  const [startState, startFormAction, startPending] = useActionState<
    StartPackingResult,
    FormData
  >((_previous, formData) => startPackingAction(START_INITIAL_STATE, formData), START_INITIAL_STATE);

  const [finishState, finishFormAction, finishPending] = useActionState<
    FinishPackingResult,
    FormData
  >((_previous, formData) => finishPackingAction(FINISH_INITIAL_STATE, formData), FINISH_INITIAL_STATE);

  const startError = startState.status === 'error' ? startState : undefined;
  const finishError = finishState.status === 'error' ? finishState : undefined;

  const canStart = order.status === 'POR_EMPACAR';
  const canFinish = order.status === 'EN_EMPAQUE' && order.packedById === actorId;
  const showsOtherPacker = order.status === 'EN_EMPAQUE' && order.packedById !== actorId;
  const lacksDistribution = order.status === 'POR_EMPACAR' && order.presentationLines.length === 0;

  return (
    <div className="flex min-h-dvh flex-col gap-4 p-4 md:p-6" data-testid={PACKING_ORDER_SCREEN_TESTID}>
      <h1 className="text-2xl font-semibold" data-testid={PACKING_ORDER_NUMBER_TESTID}>
        {order.numberText}
      </h1>

      <p className="text-base text-muted-foreground" data-testid={PACKING_ORDER_RECIPE_TESTID}>
        {order.recipeName ?? RECIPE_MISSING_TEXT}
      </p>

      <p
        className="text-base font-medium"
        data-testid={PACKING_ORDER_QUANTITY_TESTID}
        title={exactDecimalTitle(order.quantity)}
      >
        {QUANTITY_LABEL} {formatDecimalDisplay(order.quantity)}
        {order.unitLabel === null ? null : ` ${order.unitLabel}`}
      </p>

      <section
        aria-labelledby="packing-order-distribution-heading"
        className="flex flex-col gap-2"
        data-testid={PACKING_ORDER_PRESENTATION_TESTID}
      >
        <h2 id="packing-order-distribution-heading" className="text-base font-medium">
          {DISTRIBUTION_LABEL}
        </h2>
        {order.presentationLines.length === 0 ? (
          <p className="text-base text-muted-foreground">{EMPTY_DISTRIBUTION_TEXT}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {order.presentationLines.map((line) => (
              <li
                key={line.presentationId}
                className="text-base"
                data-testid={PACKING_ORDER_PRESENTATION_LINE_TESTID}
              >
                {distributionLineText(line)}
              </li>
            ))}
          </ul>
        )}
        {lacksDistribution ? (
          <p
            role="status"
            className="rounded-lg border bg-muted p-3 text-base"
            data-testid={PACKING_ORDER_MISSING_DISTRIBUTION_TESTID}
          >
            {MISSING_DISTRIBUTION_TEXT}
          </p>
        ) : null}
      </section>

      <p className="text-base" data-testid={PACKING_ORDER_PACKAGES_TESTID}>
        Envases: {order.packages ?? MISSING_VALUE_MARK}
      </p>

      <p
        className="text-base font-medium"
        data-testid={PACKING_ORDER_STATUS_TESTID}
        data-status={order.status}
      >
        {statusLabel(order.status)}
      </p>

      {canStart ? (
        <form
          action={startFormAction}
          data-testid={PACKING_ORDER_START_FORM_TESTID}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name={PACKING_ORDER_ID_FIELD} defaultValue={order.id} />
          <Button
            type="submit"
            className={TOUCH_TARGET}
            disabled={startPending}
            aria-busy={startPending}
            data-testid={PACKING_ORDER_START_BUTTON_TESTID}
          >
            {startPending ? START_PENDING_LABEL : START_LABEL}
          </Button>
        </form>
      ) : null}

      {canFinish ? (
        <form
          action={finishFormAction}
          data-testid={PACKING_ORDER_FINISH_FORM_TESTID}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name={PACKING_ORDER_ID_FIELD} defaultValue={order.id} />
          <Button
            type="submit"
            className={TOUCH_TARGET}
            disabled={finishPending}
            aria-busy={finishPending}
            data-testid={PACKING_ORDER_FINISH_BUTTON_TESTID}
          >
            {finishPending ? FINISH_PENDING_LABEL : FINISH_LABEL}
          </Button>
        </form>
      ) : null}

      {showsOtherPacker ? (
        <p className="text-base text-muted-foreground" data-testid={PACKING_ORDER_PACKER_TESTID}>
          {packerLabel(order)}
        </p>
      ) : null}

      {startError !== undefined ? (
        <div
          role="alert"
          data-testid={PACKING_ORDER_START_ERROR_TESTID}
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {startError.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={startError} />
          ) : (
            <p>{startError.message}</p>
          )}
        </div>
      ) : null}

      {finishError !== undefined ? (
        <div
          role="alert"
          data-testid={PACKING_ORDER_FINISH_ERROR_TESTID}
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {finishError.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={finishError} />
          ) : (
            <p>{finishError.message}</p>
          )}
        </div>
      ) : null}

      <Link
        href={BACK_HREF}
        className={`inline-flex w-fit items-center ${TOUCH_TARGET} text-sm font-medium underline`}
        data-testid={PACKING_ORDER_BACK_LINK_TESTID}
      >
        {BACK_LABEL}
      </Link>
    </div>
  );
}
