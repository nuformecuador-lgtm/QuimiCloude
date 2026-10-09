import Link from 'next/link';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import type { ConditioningOrderDetail, ConditioningTeamCandidates } from '@/lib/modules/asignaciones';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import type { OrderStatus } from '@/lib/modules/pedidos';
import { exactDecimalTitle, formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

import { OrderDistributionFull, assignmentViewHref, orderDistributionFullText } from '../../../components';

import { ConditioningActions } from './conditioning-actions';
import { ConditioningBatchDataForm } from './conditioning-batch-data-form';
import { ConditioningTeamList } from './conditioning-team-list';

/**
 * El detalle de un pedido para quien acondiciona. Los valores son los de su fila en «Por
 * acondicionar», que comparte la misma composición. Qué acción se ofrece lo decide la página; la
 * autorización real la hacen los casos de uso.
 */

export const CONDITIONING_ORDER_SCREEN_TESTID = 'conditioning-order-screen';
export const CONDITIONING_ORDER_NUMBER_TESTID = 'conditioning-order-number';
export const CONDITIONING_ORDER_RECIPE_TESTID = 'conditioning-order-recipe';
export const CONDITIONING_ORDER_QUANTITY_TESTID = 'conditioning-order-quantity';
export const CONDITIONING_ORDER_DISTRIBUTION_TESTID = 'conditioning-order-distribution';
export const CONDITIONING_ORDER_STATUS_TESTID = 'conditioning-order-status';
export const CONDITIONING_ORDER_CONDITIONER_TESTID = 'conditioning-order-conditioner';
export const CONDITIONING_ORDER_BACK_LINK_TESTID = 'conditioning-order-back-link';
export const CONDITIONING_ORDER_CANDIDATES_ERROR_TESTID = 'conditioning-order-candidates-error';
export const CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID = 'conditioning-order-batch-data-missing';

export const CONDITIONING_ORDER_SCREEN_TEXTS = {
  recipeMissing: 'Esta receta está dada de baja.',
  quantityLabel: 'Cantidad:',
  distributionLabel: 'Reparto',
  conditionedBy: (name: string) => `Lo acondiciona ${name}.`,
  backToQueue: 'Volver a «Por acondicionar»',
  backToFinished: 'Volver a «Terminados»',
  backToDelivered: 'Volver a «Entregados»',
  batchDataMissing: (count: number) =>
    count === 1 ? 'Faltan los datos de lote de 1 línea.' : `Faltan los datos de lote de ${count} líneas.`,
} as const;

const BATCH_DATA_MISSING_ID = 'conditioning-order-batch-data-missing';

const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Solo los cuatro estados que puede devolver `getConditioningOrder`; cualquier otro es imposible
 * aquí y se pinta tal cual sin tumbar la pantalla. Etiquetas locales porque las de la tabla viven
 * en un módulo de cliente.
 */
function statusLabel(status: OrderStatus): string {
  if (status === 'POR_ACONDICIONAR') return 'Por acondicionar';
  if (status === 'EN_ACONDICIONAMIENTO') return 'En acondicionamiento';
  if (status === 'TERMINADO') return 'Terminado';
  if (status === 'ENTREGADO') return 'Entregado';
  return status;
}

function backLink(status: OrderStatus): { readonly href: string; readonly label: string } {
  if (status === 'TERMINADO') {
    return { href: assignmentViewHref('acondicionados'), label: CONDITIONING_ORDER_SCREEN_TEXTS.backToFinished };
  }
  if (status === 'ENTREGADO') {
    return {
      href: assignmentViewHref('acondicionados_entregados'),
      label: CONDITIONING_ORDER_SCREEN_TEXTS.backToDelivered,
    };
  }
  return { href: assignmentViewHref('por_acondicionar'), label: CONDITIONING_ORDER_SCREEN_TEXTS.backToQueue };
}

export type ConditioningOrderScreenProps = {
  readonly order: ConditioningOrderDetail;
  readonly canStart?: boolean;
  readonly canFinish?: boolean;
  /** «Terminar» se ofrece deshabilitado. */
  readonly finishBlocked?: boolean;
  /** Sin candidatos no se ofrece «Acondicionar». */
  readonly candidates?: ConditioningTeamCandidates | null;
  readonly candidatesError?: ErrorState | null;
};

export function ConditioningOrderScreen({
  order,
  canStart = false,
  canFinish = false,
  finishBlocked = false,
  candidates = null,
  candidatesError = null,
}: ConditioningOrderScreenProps) {
  const back = backLink(order.status);
  const batchData = order.batchData;
  const missingCount = batchData?.missingCount ?? 0;

  return (
    <div
      className="flex min-h-dvh flex-col gap-4 p-4 md:p-6"
      data-testid={CONDITIONING_ORDER_SCREEN_TESTID}
    >
      <h1 className="text-2xl font-semibold" data-testid={CONDITIONING_ORDER_NUMBER_TESTID}>
        {order.numberText}
      </h1>

      <p className="text-base text-muted-foreground" data-testid={CONDITIONING_ORDER_RECIPE_TESTID}>
        {order.recipeName ?? CONDITIONING_ORDER_SCREEN_TEXTS.recipeMissing}
      </p>

      <p
        className="text-base font-medium"
        data-testid={CONDITIONING_ORDER_QUANTITY_TESTID}
        title={exactDecimalTitle(order.quantity)}
      >
        {CONDITIONING_ORDER_SCREEN_TEXTS.quantityLabel} {formatDecimalDisplay(order.quantity)}
        {order.unitLabel === null ? null : ` ${order.unitLabel}`}
      </p>

      <section
        aria-labelledby="conditioning-order-distribution-heading"
        className="flex flex-col gap-2"
        data-testid={CONDITIONING_ORDER_DISTRIBUTION_TESTID}
      >
        <h2 id="conditioning-order-distribution-heading" className="text-base font-medium">
          {CONDITIONING_ORDER_SCREEN_TEXTS.distributionLabel}
        </h2>
        <p className="text-base">
          <OrderDistributionFull lines={order.presentationLines} />
        </p>
      </section>

      <p
        className="text-base font-medium"
        data-testid={CONDITIONING_ORDER_STATUS_TESTID}
        data-status={order.status}
      >
        {statusLabel(order.status)}
      </p>

      {order.conditionedByName === null ? null : (
        <p className="text-base text-muted-foreground" data-testid={CONDITIONING_ORDER_CONDITIONER_TESTID}>
          {CONDITIONING_ORDER_SCREEN_TEXTS.conditionedBy(order.conditionedByName)}
        </p>
      )}

      {order.team.length > 0 ? <ConditioningTeamList team={order.team} /> : null}

      {canStart && candidates !== null ? (
        <ConditioningActions
          key="start"
          kind="start"
          orderId={order.id}
          orderNumber={order.numberText}
          candidates={candidates}
        />
      ) : null}

      {batchData === null ? null : (
        <ConditioningBatchDataForm
          orderId={order.id}
          lines={batchData.lines.map((line) => ({ ...line, label: orderDistributionFullText([line]) }))}
        />
      )}

      {missingCount > 0 ? (
        <p
          id={BATCH_DATA_MISSING_ID}
          className="text-base font-medium"
          data-testid={CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID}
        >
          {CONDITIONING_ORDER_SCREEN_TEXTS.batchDataMissing(missingCount)}
        </p>
      ) : null}

      {canFinish ? (
        <ConditioningActions
          key="finish"
          kind="finish"
          orderId={order.id}
          orderNumber={order.numberText}
          blocked={finishBlocked}
          describedBy={finishBlocked && missingCount > 0 ? BATCH_DATA_MISSING_ID : undefined}
        />
      ) : null}

      {candidatesError === null ? null : (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid={CONDITIONING_ORDER_CANDIDATES_ERROR_TESTID}
          data-code={candidatesError.code}
        >
          {candidatesError.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={candidatesError} />
          ) : (
            <p>{candidatesError.message}</p>
          )}
        </div>
      )}

      <Link
        href={back.href}
        className={`inline-flex w-fit items-center ${TOUCH_TARGET} text-base font-medium underline`}
        data-testid={CONDITIONING_ORDER_BACK_LINK_TESTID}
      >
        {back.label}
      </Link>
    </div>
  );
}
