'use client';

import { startTransition, useActionState, useCallback, useState } from 'react';

import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog';
import { ErrorAlert } from '@/components/shared/error-alert';
import { Button } from '@/components/ui/button';
import type { ErrorState } from '@/lib/modules/errores';
import type { WhatsappConnectionView } from '@/lib/modules/integraciones';
import {
  disableWhatsappConnectionAction,
  enableWhatsappConnectionAction,
  regenerateWhatsappVerifyTokenAction,
  testWhatsappConnectionAction,
} from '@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions';

import { WHATSAPP_FORM_TEXTS, WhatsappConnectionForm } from './whatsapp-connection-form';
import { useRevealWhatsappVerifyToken } from './whatsapp-webhook-panel';

export const WHATSAPP_CONNECTION_ACTIONS_TESTID = 'whatsapp-connection-actions';
export const WHATSAPP_ACTION_EDIT_TESTID = 'whatsapp-action-edit';
export const WHATSAPP_ACTION_TEST_TESTID = 'whatsapp-action-test';
export const WHATSAPP_ACTION_DISABLE_TESTID = 'whatsapp-action-disable';
export const WHATSAPP_ACTION_ENABLE_TESTID = 'whatsapp-action-enable';
export const WHATSAPP_ACTION_REGENERATE_TESTID = 'whatsapp-action-regenerate';
export const WHATSAPP_ACTION_FEEDBACK_TESTID = 'whatsapp-action-feedback';
export const WHATSAPP_DISABLE_DIALOG_TESTID = 'whatsapp-disable-dialog';
export const WHATSAPP_DISABLE_CONFIRM_TESTID = 'whatsapp-disable-confirm';
export const WHATSAPP_REGENERATE_DIALOG_TESTID = 'whatsapp-regenerate-dialog';
export const WHATSAPP_REGENERATE_CONFIRM_TESTID = 'whatsapp-regenerate-confirm';

/** Nombre del campo que leen las acciones del servidor. */
export const WHATSAPP_CONNECTION_ID_FIELD = 'id';

export const WHATSAPP_ACTION_LABELS = {
  edit: 'Editar',
  test: 'Probar conexión',
  disable: 'Deshabilitar',
  enable: 'Habilitar',
  regenerate: 'Regenerar verify token',
} as const;

export const WHATSAPP_DISABLE_DIALOG_TEXTS = {
  title: '¿Deshabilitar la conexión de WhatsApp?',
  description: 'Dejarás de recibir mensajes de WhatsApp hasta que vuelvas a habilitarla.',
  cancel: 'Cancelar',
  confirm: 'Deshabilitar',
} as const;

export const WHATSAPP_REGENERATE_DIALOG_TEXTS = {
  title: '¿Regenerar el verify token?',
  description: 'El token actual dejará de funcionar y tendrás que pegar el nuevo en Meta.',
  cancel: 'Cancelar',
  confirm: 'Regenerar',
} as const;

type ActionKey = 'test' | 'disable' | 'enable' | 'regenerate';

type Feedback =
  | { readonly kind: 'none' }
  | { readonly kind: 'error'; readonly error: ErrorState }
  | { readonly kind: 'test_failed'; readonly message: string };

const NO_FEEDBACK: Feedback = { kind: 'none' };

function idFormData(id: string): FormData {
  const formData = new FormData();
  formData.set(WHATSAPP_CONNECTION_ID_FIELD, id);
  return formData;
}

export type WhatsappConnectionActionsProps = {
  readonly connection: WhatsappConnectionView;
};

export function WhatsappConnectionActions({ connection }: WhatsappConnectionActionsProps) {
  const reveal = useRevealWhatsappVerifyToken();
  const [editing, setEditing] = useState(false);
  const [lastAction, setLastAction] = useState<ActionKey | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  const [testFeedback, runTest, testPending] = useActionState(
    async (_previous: Feedback, formData: FormData): Promise<Feedback> => {
      const result = await testWhatsappConnectionAction({ status: 'idle' }, formData);
      if (result.status === 'error') return { kind: 'error', error: result };
      if (result.status === 'tested' && !result.ok) return { kind: 'test_failed', message: result.message };
      return NO_FEEDBACK;
    },
    NO_FEEDBACK,
  );

  const [disableFeedback, runDisable, disablePending] = useActionState(
    async (_previous: Feedback, formData: FormData): Promise<Feedback> => {
      const result = await disableWhatsappConnectionAction({ status: 'idle' }, formData);
      if (result.status === 'error') return { kind: 'error', error: result };
      if (result.status === 'test_failed') return { kind: 'test_failed', message: result.message };
      return NO_FEEDBACK;
    },
    NO_FEEDBACK,
  );

  const [enableFeedback, runEnable, enablePending] = useActionState(
    async (_previous: Feedback, formData: FormData): Promise<Feedback> => {
      const result = await enableWhatsappConnectionAction({ status: 'idle' }, formData);
      if (result.status === 'error') return { kind: 'error', error: result };
      if (result.status === 'test_failed') return { kind: 'test_failed', message: result.message };
      return NO_FEEDBACK;
    },
    NO_FEEDBACK,
  );

  const [regenerateFeedback, runRegenerate, regeneratePending] = useActionState(
    async (_previous: Feedback, formData: FormData): Promise<Feedback> => {
      const result = await regenerateWhatsappVerifyTokenAction({ status: 'idle' }, formData);
      if (result.status === 'error') return { kind: 'error', error: result };
      if (result.status === 'regenerated') {
        reveal({ verifyToken: result.verifyToken, webhook: result.webhook });
      }
      return NO_FEEDBACK;
    },
    NO_FEEDBACK,
  );

  const dispatch = useCallback(
    (key: ActionKey, run: (formData: FormData) => void) => {
      setLastAction(key);
      startTransition(() => run(idFormData(connection.id)));
    },
    [connection.id],
  );

  const closeEditor = useCallback(() => setEditing(false), []);

  if (editing) {
    return (
      <div data-testid={WHATSAPP_CONNECTION_ACTIONS_TESTID}>
        <WhatsappConnectionForm
          mode="edit"
          connection={connection}
          onSaved={closeEditor}
          onCancel={closeEditor}
        />
      </div>
    );
  }

  const busy = testPending || disablePending || enablePending || regeneratePending;
  const isDisabled = connection.status === 'DISABLED';
  const feedbackByAction: Readonly<Record<ActionKey, Feedback>> = {
    test: testFeedback,
    disable: disableFeedback,
    enable: enableFeedback,
    regenerate: regenerateFeedback,
  };
  const feedback = lastAction === null ? NO_FEEDBACK : feedbackByAction[lastAction];

  return (
    <div data-testid={WHATSAPP_CONNECTION_ACTIONS_TESTID} className="flex flex-col gap-3">
      <ActionFeedback feedback={feedback} />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          touch
          disabled={busy}
          onClick={() => setEditing(true)}
          data-testid={WHATSAPP_ACTION_EDIT_TESTID}
        >
          {WHATSAPP_ACTION_LABELS.edit}
        </Button>

        {isDisabled ? null : (
          <Button
            type="button"
            variant="outline"
            touch
            disabled={busy}
            aria-busy={testPending}
            onClick={() => dispatch('test', runTest)}
            data-testid={WHATSAPP_ACTION_TEST_TESTID}
          >
            {WHATSAPP_ACTION_LABELS.test}
          </Button>
        )}

        {isDisabled ? (
          <Button
            type="button"
            variant="outline"
            touch
            disabled={busy}
            aria-busy={enablePending}
            onClick={() => dispatch('enable', runEnable)}
            data-testid={WHATSAPP_ACTION_ENABLE_TESTID}
          >
            {WHATSAPP_ACTION_LABELS.enable}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            touch
            disabled={busy}
            aria-busy={disablePending}
            onClick={() => setDisableOpen(true)}
            data-testid={WHATSAPP_ACTION_DISABLE_TESTID}
          >
            {WHATSAPP_ACTION_LABELS.disable}
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          touch
          disabled={busy}
          aria-busy={regeneratePending}
          onClick={() => setRegenerateOpen(true)}
          data-testid={WHATSAPP_ACTION_REGENERATE_TESTID}
        >
          {WHATSAPP_ACTION_LABELS.regenerate}
        </Button>
      </div>

      <ConfirmActionDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        onConfirm={() => dispatch('disable', runDisable)}
        texts={WHATSAPP_DISABLE_DIALOG_TEXTS}
        testId={WHATSAPP_DISABLE_DIALOG_TESTID}
        confirmTestId={WHATSAPP_DISABLE_CONFIRM_TESTID}
      />
      <ConfirmActionDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        onConfirm={() => dispatch('regenerate', runRegenerate)}
        texts={WHATSAPP_REGENERATE_DIALOG_TEXTS}
        testId={WHATSAPP_REGENERATE_DIALOG_TESTID}
        confirmTestId={WHATSAPP_REGENERATE_CONFIRM_TESTID}
      />
    </div>
  );
}

const FEEDBACK_CLASS = 'flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive';

function ActionFeedback({ feedback }: { readonly feedback: Feedback }) {
  if (feedback.kind === 'none') return null;

  if (feedback.kind === 'test_failed') {
    return (
      <div role="alert" className={FEEDBACK_CLASS} data-testid={WHATSAPP_ACTION_FEEDBACK_TESTID}>
        <p className="break-words">
          {WHATSAPP_FORM_TEXTS.testFailedPrefix}
          {feedback.message}
        </p>
      </div>
    );
  }

  return (
    <ErrorAlert
      error={feedback.error}
      className={FEEDBACK_CLASS}
      testId={WHATSAPP_ACTION_FEEDBACK_TESTID}
      withDataCode
    />
  );
}
