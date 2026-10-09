'use client';

import { useActionState, useState } from 'react';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ConditioningTeamCandidates } from '@/lib/modules/asignaciones';
import {
  startConditioningAction,
  type StartConditioningResult,
} from '@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';

import {
  ConditioningTeamPicker,
  EMPTY_CONDITIONING_TEAM_SELECTION,
  hasConditioningTeamSelection,
  type ConditioningTeamSelection,
} from './conditioning-team-picker';
import { CountdownGatedButton } from './countdown-gated-button';

export const START_CONDITIONING_DIALOG_TESTID = 'start-conditioning-dialog';
export const START_CONDITIONING_FORM_TESTID = 'start-conditioning-form';
export const START_CONDITIONING_CANCEL_TESTID = 'start-conditioning-cancel';
export const START_CONDITIONING_ERROR_TESTID = 'start-conditioning-error';
export const START_CONDITIONING_ORDER_ID_FIELD = 'orderId';

export const START_CONDITIONING_TEXTS = {
  title: (orderNumber: string) => `Acondicionar el pedido ${orderNumber}`,
  cancel: 'Cancelar',
  confirm: 'Comenzar',
} as const;

const TOUCH_TARGET = 'min-h-11 min-w-11';

type StartFormState = { readonly status: 'idle' } | StartConditioningResult;

const INITIAL_STATE: StartFormState = { status: 'idle' };
const IGNORED_PREV_STATE: StartConditioningResult = { status: 'success' };

export type StartConditioningDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly candidates: ConditioningTeamCandidates;
};

export function StartConditioningDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  candidates,
}: StartConditioningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[100dvh] overflow-y-auto"
        data-testid={START_CONDITIONING_DIALOG_TESTID}
      >
        <StartConditioningForm
          orderId={orderId}
          orderNumber={orderNumber}
          candidates={candidates}
          onStarted={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type StartConditioningFormProps = {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly candidates: ConditioningTeamCandidates;
  readonly onStarted: () => void;
};

function StartConditioningForm({ orderId, orderNumber, candidates, onStarted }: StartConditioningFormProps) {
  const [selection, setSelection] = useState<ConditioningTeamSelection>(EMPTY_CONDITIONING_TEAM_SELECTION);

  const [state, formAction, isPending] = useActionState<StartFormState, FormData>(
    async (_previous, formData) => {
      const result = await startConditioningAction(IGNORED_PREV_STATE, formData);
      if (result.status === 'success') onStarted();
      return result;
    },
    INITIAL_STATE,
  );

  const error = state.status === 'error' ? state : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid={START_CONDITIONING_FORM_TESTID}>
      <DialogHeader>
        <DialogTitle>{START_CONDITIONING_TEXTS.title(orderNumber)}</DialogTitle>
      </DialogHeader>

      <input type="hidden" name={START_CONDITIONING_ORDER_ID_FIELD} value={orderId} />

      <ConditioningTeamPicker
        candidates={candidates}
        selection={selection}
        onSelectionChange={setSelection}
        disabled={isPending}
      />

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid={START_CONDITIONING_ERROR_TESTID}
          data-code={error.code}
        >
          {error.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={error} />
          ) : (
            <p>{error.message}</p>
          )}
        </div>
      )}

      <DialogFooter>
        <DialogClose
          render={
            <Button
              type="button"
              variant="outline"
              className={TOUCH_TARGET}
              disabled={isPending}
              data-testid={START_CONDITIONING_CANCEL_TESTID}
            />
          }
        >
          {START_CONDITIONING_TEXTS.cancel}
        </DialogClose>
        <CountdownGatedButton
          label={START_CONDITIONING_TEXTS.confirm}
          disabled={isPending || !hasConditioningTeamSelection(selection)}
        />
      </DialogFooter>
    </form>
  );
}
