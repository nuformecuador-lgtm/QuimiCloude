import Link from 'next/link';

import type { ConditioningOrderRow } from '@/lib/modules/asignaciones';
import type { OrderStatus } from '@/lib/modules/pedidos';
import { exactDecimalTitle, formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

import { OrderDistributionFull, assignmentViewHref } from '../../../components';

/**
 * El detalle de un pedido para quien acondiciona, en solo lectura: sin formulario, sin botón y sin
 * ninguna Server Action. Los valores son los de su fila en «Por acondicionar», que comparte la
 * misma composición.
 */

export const CONDITIONING_ORDER_SCREEN_TESTID = 'conditioning-order-screen';
export const CONDITIONING_ORDER_NUMBER_TESTID = 'conditioning-order-number';
export const CONDITIONING_ORDER_RECIPE_TESTID = 'conditioning-order-recipe';
export const CONDITIONING_ORDER_QUANTITY_TESTID = 'conditioning-order-quantity';
export const CONDITIONING_ORDER_DISTRIBUTION_TESTID = 'conditioning-order-distribution';
export const CONDITIONING_ORDER_STATUS_TESTID = 'conditioning-order-status';
export const CONDITIONING_ORDER_CONDITIONER_TESTID = 'conditioning-order-conditioner';
export const CONDITIONING_ORDER_BACK_LINK_TESTID = 'conditioning-order-back-link';

export const CONDITIONING_ORDER_SCREEN_TEXTS = {
  recipeMissing: 'Esta receta está dada de baja.',
  quantityLabel: 'Cantidad:',
  distributionLabel: 'Reparto',
  conditionedBy: (name: string) => `Lo acondiciona ${name}.`,
  backToQueue: 'Volver a «Por acondicionar»',
  backToFinished: 'Volver a «Terminados»',
} as const;

const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Solo los tres estados que puede devolver `getConditioningOrder`; cualquier otro es imposible
 * aquí y se pinta tal cual sin tumbar la pantalla. Etiquetas locales porque las de la tabla viven
 * en un módulo de cliente.
 */
function statusLabel(status: OrderStatus): string {
  if (status === 'POR_ACONDICIONAR') return 'Por acondicionar';
  if (status === 'EN_ACONDICIONAMIENTO') return 'En acondicionamiento';
  if (status === 'TERMINADO') return 'Terminado';
  return status;
}

function backLink(status: OrderStatus): { readonly href: string; readonly label: string } {
  return status === 'TERMINADO'
    ? { href: assignmentViewHref('acondicionados'), label: CONDITIONING_ORDER_SCREEN_TEXTS.backToFinished }
    : { href: assignmentViewHref('por_acondicionar'), label: CONDITIONING_ORDER_SCREEN_TEXTS.backToQueue };
}

export type ConditioningOrderScreenProps = {
  readonly order: ConditioningOrderRow;
};

export function ConditioningOrderScreen({ order }: ConditioningOrderScreenProps) {
  const back = backLink(order.status);

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
