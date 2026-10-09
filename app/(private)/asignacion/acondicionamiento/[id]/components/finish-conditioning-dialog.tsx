'use client';

import { useActionState } from 'react';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  finishConditioningAction,
  type FinishConditioningResult,
} from '@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';

import { CountdownGatedButton } from './countdown-gated-button';

export const FINISH_CONDITIONING_DIALOG_TESTID = 'finish-conditioning-dialog';
export const FINISH_CONDITIONING_FORM_TESTID = 'finish-conditioning-form';
export const FINISH_CONDITIONING_CANCEL_TESTID = 'finish-conditioning-cancel';
export const FINISH_CONDITIONING_ERROR_TESTID = 'finish-conditioning-error';
export const FINISH_CONDITIONING_ORDER_ID_FIELD = 'orderId';

export const FINISH_CONDITIONING_TEXTS = {
  title: 'Terminar el acondicionamiento',
  description: (orderNumber: string) => `El pedido ${orderNumber} pasará a Terminado.`,
  cancel: 'Cancelar',
  confirm: 'Terminar',
} as const;

const TOUCH_TARGET = 'min-h-11 min-w-11';

type FinishFormState = { readonly status: 'idle' } | FinishConditioningResult;

const INITIAL_STATE: FinishFormState = { status: 'idle' };
const IGNORED_PREV_STATE: FinishConditioningResult = { status: 'success' };

export type FinishConditioningDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly orderId: string;
  readonly orderNumber: string;
};

export function FinishConditioningDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
}: FinishConditioningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-h-[100dvh] overflow-y-auto"
        data-testid={FINISH_CONDITIONING_DIALOG_TESTID}
      >
        <FinishConditioningForm orderId={orderId} orderNumber={orderNumber} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

type FinishConditioningFormProps = {
  readonly orderId: string;
  readonly orderNumber: string;
};

// Con éxito la acción redirige fuera del detalle; aquí solo se pinta el rechazo.
function FinishConditioningForm({ orderId, orderNumber }: FinishConditioningFormProps) {
  const [state, formAction, isPending] = useActionState<FinishFormState, FormData>(
    (_previous, formData) => finishConditioningAction(IGNORED_PREV_STATE, formData),
    INITIAL_STATE,
  );

  const error = state.status === 'error' ? state : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid={FINISH_CONDITIONING_FORM_TESTID}>
      <AlertDialogHeader>
        <AlertDialogTitle>{FINISH_CONDITIONING_TEXTS.title}</AlertDialogTitle>
        <AlertDialogDescription>{FINISH_CONDITIONING_TEXTS.description(orderNumber)}</AlertDialogDescription>
      </AlertDialogHeader>

      <input type="hidden" name={FINISH_CONDITIONING_ORDER_ID_FIELD} value={orderId} />

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid={FINISH_CONDITIONING_ERROR_TESTID}
          data-code={error.code}
        >
          {error.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={error} />
          ) : (
            <p>{error.message}</p>
          )}
        </div>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel
          type="button"
          className={TOUCH_TARGET}
          disabled={isPending}
          data-testid={FINISH_CONDITIONING_CANCEL_TESTID}
        >
          {FINISH_CONDITIONING_TEXTS.cancel}
        </AlertDialogCancel>
        <CountdownGatedButton label={FINISH_CONDITIONING_TEXTS.confirm} disabled={isPending} />
      </AlertDialogFooter>
    </form>
  );
}
