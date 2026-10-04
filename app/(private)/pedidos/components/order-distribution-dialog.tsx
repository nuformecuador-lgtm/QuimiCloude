'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { PresentationUnitSelect } from '@/components/shared/presentation-unit-select';
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  errorMessage,
  UNEXPECTED_ERROR_CODE,
  type ErrorCode,
  type ErrorState,
} from '@/lib/modules/errores';
import { newRequestId } from '@/lib/modules/observabilidad';
import type { OrderSummary } from '@/lib/modules/pedidos';
import {
  updateOrderDistributionAction,
  type OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import type { UnitView } from '@/lib/modules/unidades';
import { trimDecimal } from '@/lib/shared/ui/decimal-display';

import { BlockedOrderDialog } from './blocked-order-dialog';
import { compatibleUnitIds } from './compatible-unit-ids';
import { OrderDistributionField } from './order-distribution-field';
import {
  availabilityBlocksSave,
  fromOrderPresentationLines,
  toPresentationLinesInput,
  useOrderDistributionAvailability,
  type OrderDistributionLine,
} from './use-order-distribution-availability';

export const ORDER_DISTRIBUTION_DIALOG_TESTID = 'order-distribution-dialog';
export const ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID = 'order-distribution-dialog-submit';
export const ORDER_DISTRIBUTION_DIALOG_DISMISS_TESTID = 'order-distribution-dialog-dismiss';
export const ORDER_DISTRIBUTION_DIALOG_ERROR_TESTID = 'order-distribution-dialog-error';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const WOULD_BLOCK_CODE = 'order_would_block' satisfies ErrorCode;

const LABELS = {
  title: 'Reparto y unidad',
  description: (numberText: string) =>
    `Pedido ${numberText}. Solo se cambian la unidad y el reparto en envases.`,
  submit: 'Guardar',
  saving: 'Guardando…',
  dismiss: 'Cancelar',
  success: 'Reparto actualizado.',
} as const;

export type OrderDistributionDraft = {
  readonly unitId: string;
  readonly lines: readonly OrderDistributionLine[];
};

export type OrderDistributionDialogProps = {
  readonly order: OrderSummary;
  readonly units: readonly UnitView[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Lo ultimo guardado desde este dialogo mientras `order` aun no lo refleja: `router.refresh()`
   * no se espera, y reabrir con los valores viejos y guardar desharia el cambio.
   */
  readonly saved?: OrderDistributionDraft;
  readonly onSaved?: (saved: OrderDistributionDraft) => void;
};

function unexpectedFromRejection(): ErrorState {
  return {
    status: 'error',
    code: UNEXPECTED_ERROR_CODE,
    message: errorMessage(UNEXPECTED_ERROR_CODE),
    reference: newRequestId(),
  };
}

function resolveUnitLabel(
  units: readonly UnitView[],
  unitId: string,
  order: OrderSummary,
): string | null {
  const unit = units.find((candidate) => candidate.id === unitId);
  if (unit !== undefined) return unit.symbol ?? unit.name;
  return order.unitId === unitId ? order.unitLabel : null;
}

/**
 * Edicion acotada del pedido ya finalizado: solo unidad y reparto. Es un formulario aparte, no el
 * general con campos deshabilitados, para que cantidad, receta o responsables no puedan viajar.
 */
export function OrderDistributionDialog({
  order,
  units,
  open,
  onOpenChange,
  saved,
  onSaved,
}: OrderDistributionDialogProps) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(saved?.unitId ?? order.unitId ?? '');
  const [lines, setLines] = useState<readonly OrderDistributionLine[]>(
    () => saved?.lines ?? fromOrderPresentationLines(order.presentationLines),
  );
  const [error, setError] = useState<ErrorState | null>(null);
  const [blocked, setBlocked] = useState<{
    readonly message: string;
    readonly draft: OrderDistributionDraft;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const availability = useOrderDistributionAvailability({
    quantity: trimDecimal(order.quantity),
    unitId,
    lines,
  });
  const compatibleIds = useMemo(() => compatibleUnitIds(units, unitId), [units, unitId]);
  const canSave = unitId !== '' && !isPending && !availabilityBlocksSave(availability);

  function save() {
    if (!canSave) return;
    send({ unitId, lines }, false);
  }

  /** `confirmBlocked` solo viaja tras aceptar el aviso, y con el mismo reparto que lo provoco. */
  function send(draft: OrderDistributionDraft, confirmBlocked: boolean) {
    const input = {
      unitId: draft.unitId,
      presentationLines: toPresentationLinesInput(draft.lines),
      ...(confirmBlocked ? { confirmBlocked: true } : {}),
    };
    startTransition(async () => {
      let result: OrderMutationFormState;
      try {
        result = await updateOrderDistributionAction(order.id, input);
      } catch {
        setError(unexpectedFromRejection());
        return;
      }
      if (result.status === 'error' && result.code === WOULD_BLOCK_CODE) {
        setError(null);
        setBlocked({ message: result.message, draft });
        return;
      }
      if (result.status === 'error') {
        setError(result);
        return;
      }
      setError(null);
      onSaved?.(draft);
      onOpenChange(false);
      toast.success(LABELS.success);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        data-testid={ORDER_DISTRIBUTION_DIALOG_TESTID}
      >
        <BlockedOrderDialog
          open={blocked !== null}
          message={blocked?.message ?? ''}
          onConfirm={() => {
            if (blocked === null) return;
            setBlocked(null);
            send(blocked.draft, true);
          }}
          onDismiss={() => setBlocked(null)}
        />
        <DialogHeader>
          <DialogTitle>{LABELS.title}</DialogTitle>
          <DialogDescription>{LABELS.description(order.numberText)}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <PresentationUnitSelect
            units={units}
            name={null}
            value={unitId}
            onValueChange={setUnitId}
          />

          <OrderDistributionField
            lines={lines}
            onLinesChange={setLines}
            unitId={unitId}
            compatibleUnitIds={compatibleIds}
            unitLabel={resolveUnitLabel(units, unitId, order)}
            quantity={trimDecimal(order.quantity)}
            units={units}
            availability={availability}
            submitLines={false}
          />

          {error === null ? null : (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
              data-testid={ORDER_DISTRIBUTION_DIALOG_ERROR_TESTID}
              data-code={error.code}
            >
              {error.code === UNEXPECTED_ERROR_CODE ? (
                <UnexpectedErrorNotice state={error} />
              ) : (
                <p>{error.message}</p>
              )}
            </div>
          )}

          <DialogFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className={TOUCH_TARGET}
                  data-testid={ORDER_DISTRIBUTION_DIALOG_DISMISS_TESTID}
                />
              }
            >
              {LABELS.dismiss}
            </DialogClose>
            <Button
              type="submit"
              className={TOUCH_TARGET}
              disabled={!canSave}
              data-testid={ORDER_DISTRIBUTION_DIALOG_SUBMIT_TESTID}
            >
              {isPending ? LABELS.saving : LABELS.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
