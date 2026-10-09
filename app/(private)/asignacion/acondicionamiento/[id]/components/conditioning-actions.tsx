'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { ConditioningTeamCandidates } from '@/lib/modules/asignaciones';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { FinishConditioningDialog } from './finish-conditioning-dialog';
import { StartConditioningDialog } from './start-conditioning-dialog';

export const CONDITIONING_START_BUTTON_TESTID = 'conditioning-start-button';
export const CONDITIONING_FINISH_BUTTON_TESTID = 'conditioning-finish-button';

export const CONDITIONING_ACTIONS_TEXTS = {
  start: 'Acondicionar',
  finish: 'Terminar',
} as const;

export type ConditioningActionsProps =
  | {
      readonly kind: 'start';
      readonly orderId: string;
      readonly orderNumber: string;
      readonly candidates: ConditioningTeamCandidates;
    }
  | {
      readonly kind: 'finish';
      readonly orderId: string;
      readonly orderNumber: string;
    };

export function ConditioningActions(props: ConditioningActionsProps) {
  const [open, setOpen] = useState(false);
  // Cada apertura monta el modal de cero: la espera vuelve a empezar y no queda nada de la anterior.
  const [opening, setOpening] = useState(0);

  function openDialog(): void {
    setOpening((current) => current + 1);
    setOpen(true);
  }

  const isStart = props.kind === 'start';

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className={`w-fit ${touchTarget}`}
        onClick={openDialog}
        data-testid={isStart ? CONDITIONING_START_BUTTON_TESTID : CONDITIONING_FINISH_BUTTON_TESTID}
      >
        {isStart ? CONDITIONING_ACTIONS_TEXTS.start : CONDITIONING_ACTIONS_TEXTS.finish}
      </Button>
      {props.kind === 'start' ? (
        <StartConditioningDialog
          key={opening}
          open={open}
          onOpenChange={setOpen}
          orderId={props.orderId}
          orderNumber={props.orderNumber}
          candidates={props.candidates}
        />
      ) : (
        <FinishConditioningDialog
          key={opening}
          open={open}
          onOpenChange={setOpen}
          orderId={props.orderId}
          orderNumber={props.orderNumber}
        />
      )}
    </div>
  );
}
