'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ErrorAlert } from '@/components/shared/error-alert';
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
import { errorMessage, UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { newRequestId } from '@/lib/modules/observabilidad';
import type { OrderSummary } from '@/lib/modules/pedidos';
import {
  setOrderCustomerAction,
  type OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { orderCustomerChoiceId, type OrderCustomerChoice } from './order-customer-label';
import { OrderCustomerPicker } from './order-customer-picker';

export const ORDER_CUSTOMER_DIALOG_TESTID = 'order-customer-dialog';
export const ORDER_CUSTOMER_DIALOG_SUBMIT_TESTID = 'order-customer-dialog-submit';
export const ORDER_CUSTOMER_DIALOG_REMOVE_TESTID = 'order-customer-dialog-remove';
export const ORDER_CUSTOMER_DIALOG_DISMISS_TESTID = 'order-customer-dialog-dismiss';
export const ORDER_CUSTOMER_DIALOG_ERROR_TESTID = 'order-customer-dialog-error';

export const ORDER_CUSTOMER_DIALOG_TOUCH_TARGET = touchTarget;

const LABELS = {
  title: 'Cliente',
  description: (numberText: string) => `Pedido ${numberText}. Solo se cambia el cliente.`,
  field: 'Cliente',
  placeholder: 'Busca un cliente por su nombre',
  empty: 'Ningún cliente coincide con la búsqueda.',
  submit: 'Guardar',
  saving: 'Guardando…',
  remove: 'Quitar cliente',
  dismiss: 'Cancelar',
  success: 'Cliente actualizado.',
} as const;

function unexpectedFromRejection(): ErrorState {
  return {
    status: 'error',
    code: UNEXPECTED_ERROR_CODE,
    message: errorMessage(UNEXPECTED_ERROR_CODE),
    reference: newRequestId(),
  };
}

export type OrderCustomerDialogProps = {
  readonly order: OrderSummary;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

/** Cambia solo el cliente del pedido, en cualquier estado. */
export function OrderCustomerDialog({ order, open, onOpenChange }: OrderCustomerDialogProps) {
  const router = useRouter();
  const fieldId = useId();
  const [choice, setChoice] = useState<OrderCustomerChoice | null>(
    order.customer === null ? null : { kind: 'customer', customer: order.customer },
  );
  const [error, setError] = useState<ErrorState | null>(null);
  const [isPending, startTransition] = useTransition();

  function send(customerId: string | null) {
    startTransition(async () => {
      let result: OrderMutationFormState;
      try {
        result = await setOrderCustomerAction(order.id, { customerId });
      } catch {
        setError(unexpectedFromRejection());
        return;
      }

      if (result.status === 'error') {
        setError(result);
        return;
      }

      setError(null);
      onOpenChange(false);
      toast.success(LABELS.success);
      router.refresh();
    });
  }

  const chosenId = orderCustomerChoiceId(choice);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        data-testid={ORDER_CUSTOMER_DIALOG_TESTID}
      >
        <DialogHeader>
          <DialogTitle>{LABELS.title}</DialogTitle>
          <DialogDescription>{LABELS.description(order.numberText)}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            send(chosenId === '' ? null : chosenId);
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={fieldId} className="text-sm font-medium">
              {LABELS.field}
            </label>
            <OrderCustomerPicker
              purpose="assign"
              id={fieldId}
              value={choice}
              onChange={setChoice}
              disabled={isPending}
              placeholder={LABELS.placeholder}
              emptyMessage={LABELS.empty}
            />
          </div>

          {error === null ? null : (
            <ErrorAlert
              error={error}
              className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
              testId={ORDER_CUSTOMER_DIALOG_ERROR_TESTID}
              withDataCode
            />
          )}

          <DialogFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className={touchTarget}
                  data-testid={ORDER_CUSTOMER_DIALOG_DISMISS_TESTID}
                />
              }
            >
              {LABELS.dismiss}
            </DialogClose>
            <Button
              type="button"
              variant="outline"
              className={touchTarget}
              disabled={isPending || order.customer === null}
              onClick={() => send(null)}
              data-testid={ORDER_CUSTOMER_DIALOG_REMOVE_TESTID}
            >
              {LABELS.remove}
            </Button>
            <Button
              type="submit"
              className={touchTarget}
              disabled={isPending}
              data-testid={ORDER_CUSTOMER_DIALOG_SUBMIT_TESTID}
            >
              {isPending ? LABELS.saving : LABELS.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
