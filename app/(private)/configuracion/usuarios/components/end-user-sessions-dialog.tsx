'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId } from 'react';
import { toast } from 'sonner';

import { ErrorAlert } from '@/components/shared/error-alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { UserRow } from '@/lib/modules/identity';
import {
  endAllSessionsAction,
  type EndSessionsFormState,
} from '@/lib/modules/identity/adapters/driving/session-actions';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { endUserSessionsMessage, endUserSessionsSuccess, endUserSessionsTitle } from './user-labels';

/**
 * La confirmacion del cierre de TODAS las sesiones de otra persona (QC-101 R9, R10, R13, R14, R15,
 * R19; `design.md > 2`). Misma forma que `delete-user-dialog.tsx`, a proposito.
 *
 * **Nombra a la persona** en el titulo y en la descripcion, y advierte que tendra que volver a
 * entrar (R9): la accion expulsa a alguien que puede estar trabajando, y el nombre dentro es lo que
 * convierte un «¿seguro?» en una comprobacion real (decision cerrada 4).
 *
 * **MIENTRAS no se confirme, la action NO se invoca** (R9): el unico camino hasta
 * `endAllSessionsAction` es el envio de ESTE formulario, y solo lo envia el boton de confirmar.
 * Abrir el dialogo no cierra ninguna sesion. El formulario es propio y no choca con el del panel de
 * edicion: `AlertDialogContent` se monta en un portal, fuera del arbol del `<form>` del panel.
 *
 * **Un rechazo se pinta DENTRO del dialogo, por su `code` y nunca por su texto** (R14), el dialogo
 * **sigue abierto** y no se avisa de exito. Los vivos son `unauthorized` —los permisos de la sesion
 * son una foto del login y envejecen— y `user_not_found`; `unexpected` lo pinta
 * `UnexpectedErrorNotice` con su identificador de peticion. Quien lo monta lo hace solo mientras
 * esta abierto, asi que un rechazo anterior no reaparece.
 *
 * Con exito, en este orden (R13): cerrar, avisar por el `<Toaster />` del layout privado —no uno
 * propio— con un texto que **no promete ningun numero** (R19: el sistema no sabe cuantas cerro), y
 * `router.refresh()`, que conserva la MISMA URL.
 */

export const END_USER_SESSIONS_DIALOG_TESTID = 'end-user-sessions-dialog';
export const END_USER_SESSIONS_MESSAGE_TESTID = 'end-user-sessions-message';
export const END_USER_SESSIONS_CONFIRM_TESTID = 'end-user-sessions-confirm';
export const END_USER_SESSIONS_DISMISS_TESTID = 'end-user-sessions-dismiss';
export const END_USER_SESSIONS_ERROR_TESTID = 'end-user-sessions-error';
export const END_USER_SESSIONS_ERROR_MESSAGE_TESTID = 'end-user-sessions-error-message';
export const END_USER_SESSIONS_FORM_TESTID = 'end-user-sessions-form';
export const END_USER_SESSIONS_ID_TESTID = 'end-user-sessions-id';

/** El `id` viaja como campo OCULTO: es el unico campo que lee `endAllSessionsAction`. */
export const END_USER_SESSIONS_ID_FIELD = 'id';

const CONFIRM_LABEL = 'Cerrar sesiones';
const CONFIRM_PENDING_LABEL = 'Cerrando…';
const DISMISS_LABEL = 'Volver';

/** El estado inicial lo construye esta pantalla: un archivo `'use server'` no exporta constantes. */
const INITIAL_STATE: EndSessionsFormState = { status: 'idle' };

export type EndUserSessionsDialogProps = {
  /** La persona del panel. Solo se usan su `id` (campo oculto) y su `displayName` (textos). */
  readonly user: UserRow;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function EndUserSessionsDialog({ user, open, onOpenChange }: EndUserSessionsDialogProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(endAllSessionsAction, INITIAL_STATE);
  const { displayName } = user;

  useEffect(() => {
    if (state.status !== 'success') return;
    // R13, en este orden: cerrar, avisar y poner la pantalla al dia con la MISMA URL.
    onOpenChange(false);
    toast.success(endUserSessionsSuccess(displayName));
    router.refresh();
  }, [state, onOpenChange, router, displayName]);

  const error = state.status === 'error' ? state : undefined;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={END_USER_SESSIONS_DIALOG_TESTID}>
        <AlertDialogHeader>
          <AlertDialogTitle>{endUserSessionsTitle(displayName)}</AlertDialogTitle>
          <AlertDialogDescription data-testid={END_USER_SESSIONS_MESSAGE_TESTID}>
            {endUserSessionsMessage(displayName)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error === undefined ? null : (
          <ErrorAlert
            error={error}
            id={errorId}
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            testId={END_USER_SESSIONS_ERROR_TESTID}
            withDataCode
            renderCatalogued={(catalogued) => (
              <p data-testid={END_USER_SESSIONS_ERROR_MESSAGE_TESTID}>{catalogued.message}</p>
            )}
          />
        )}

        <form action={formAction} data-testid={END_USER_SESSIONS_FORM_TESTID}>
          <input
            type="hidden"
            name={END_USER_SESSIONS_ID_FIELD}
            defaultValue={user.id}
            data-testid={END_USER_SESSIONS_ID_TESTID}
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              className={touchTarget}
              data-testid={END_USER_SESSIONS_DISMISS_TESTID}
            >
              {DISMISS_LABEL}
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              className={touchTarget}
              disabled={isPending}
              aria-busy={isPending}
              aria-describedby={error === undefined ? undefined : errorId}
              data-testid={END_USER_SESSIONS_CONFIRM_TESTID}
            >
              {isPending ? CONFIRM_PENDING_LABEL : CONFIRM_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
