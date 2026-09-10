'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId } from 'react';
import { toast } from 'sonner';

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
import type { ErrorCode } from '@/lib/modules/errores';
import type { PresentationView } from '@/lib/modules/inventario';
import {
  deletePresentationAction,
  type PresentationMutationFormState,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';

/**
 * Confirmacion del borrado de una presentacion (R27, R28, R25, `design.md > 7`).
 *
 * **El dialogo NOMBRA la presentacion** por su `name` -lo que el usuario ve en la lista-, nunca
 * por el uuid: un identificador tecnico en una confirmacion irreversible no dice cual de las
 * presentaciones esta a punto de desaparecer. El uuid viaja donde tiene que viajar, en el campo
 * oculto que la operacion lee.
 *
 * **Sin confirmar no se invoca NADA** (R27): la operacion sale del `submit` de un `<form>` que vive
 * DENTRO del contenido del dialogo, y ese formulario solo se envia al pulsar confirmar. El `id` va
 * en un `input` oculto, que es la forma que `deletePresentationAction` espera -lo dice su propia
 * cabecera-, asi que no hace falta `bind`.
 *
 * **Aqui el borrado es FISICO y el rechazo lo produce la FK real** (`ON DELETE RESTRICT`), no una
 * regla de estado: `presentation_in_use` es el caso NORMAL, no el raro. Por eso se pinta en la
 * region de error de este mismo dialogo, que **sigue abierto** -cerrarlo dejaria al usuario
 * creyendo que se borro- y se decide por el `code` estable, jamas por el texto (R28).
 *
 * **Con exito se aplica R25**: cerrar, avisar por toast sobre el `<Toaster />` que el layout privado
 * ya monta -**no se monta otro** (R26)- y `router.refresh()` con la MISMA URL, que conserva pagina,
 * orden y filtros.
 *
 * **Apertura CONTROLADA**: quien dispara es la fila. Aqui no hay disparador propio.
 */

export const DELETE_PRESENTATION_DIALOG_TESTID = 'delete-presentation-dialog';
export const DELETE_PRESENTATION_MESSAGE_TESTID = 'delete-presentation-message';
export const DELETE_PRESENTATION_CONFIRM_TESTID = 'delete-presentation-confirm';
export const DELETE_PRESENTATION_DISMISS_TESTID = 'delete-presentation-dismiss';
export const DELETE_PRESENTATION_ERROR_TESTID = 'delete-presentation-error';
export const DELETE_PRESENTATION_ERROR_MESSAGE_TESTID = 'delete-presentation-error-message';
export const DELETE_PRESENTATION_FORM_TESTID = 'delete-presentation-form';
export const DELETE_PRESENTATION_ID_TESTID = 'delete-presentation-id';

/** Nombre del campo del `FormData` que lee el adaptador driving (`presentation-actions.ts`). */
export const DELETE_PRESENTATION_ID_FIELD = 'id';

/**
 * Codigo estable del rechazo por FK; por el se decide, nunca por el texto (R28).
 *
 * QC-70 (R20): el VALOR no cambia -R19 lo congela, ya era inequivoco-, pero el literal deja de
 * estar suelto y queda tipado con `ErrorCode`, la union cerrada del catalogo: si el codigo
 * desapareciera o se renombrara, esto rompe el typecheck en vez de comparar contra una palabra
 * que ya no emite nadie.
 */
// QC-71 (R16): `satisfies` en vez de anotacion, mismo motivo que en `cancel-order-dialog`: el
// tipo ancho arrastraria el codigo generico, que desde esta ficha exige `reference`.
export const PRESENTATION_IN_USE_CODE = 'presentation_in_use' satisfies ErrorCode;

const TOUCH_TARGET = 'min-h-11 min-w-11';

const TITLE = 'Eliminar la presentación';
const CONFIRM_LABEL = 'Eliminar';
const CONFIRM_PENDING_LABEL = 'Eliminando…';
const DISMISS_LABEL = 'Volver';
const DELETE_SUCCESS = 'Presentación eliminada.';

const INITIAL_STATE: PresentationMutationFormState = { status: 'idle' };

export type DeletePresentationDialogProps = {
  /** La presentacion llega por props desde la fila (R32). */
  readonly presentation: PresentationView;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function DeletePresentationDialog({
  presentation,
  open,
  onOpenChange,
}: DeletePresentationDialogProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deletePresentationAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    // R25, en este orden: cerrar, avisar y poner la lista al dia sin recargar la pantalla.
    onOpenChange(false);
    toast.success(DELETE_SUCCESS);
    router.refresh();
  }, [state, onOpenChange, router]);

  const error = state.status === 'error' ? state : undefined;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={DELETE_PRESENTATION_DIALOG_TESTID}>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLE}</AlertDialogTitle>
          <AlertDialogDescription data-testid={DELETE_PRESENTATION_MESSAGE_TESTID}>
            Se va a eliminar la presentación {presentation.name}. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error === undefined ? null : (
          <div
            role="alert"
            id={errorId}
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid={DELETE_PRESENTATION_ERROR_TESTID}
            data-code={error.code}
          >
            <p data-testid={DELETE_PRESENTATION_ERROR_MESSAGE_TESTID}>{error.message}</p>
          </div>
        )}

        <form action={formAction} data-testid={DELETE_PRESENTATION_FORM_TESTID}>
          <input
            type="hidden"
            name={DELETE_PRESENTATION_ID_FIELD}
            defaultValue={presentation.id}
            data-testid={DELETE_PRESENTATION_ID_TESTID}
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              className={TOUCH_TARGET}
              data-testid={DELETE_PRESENTATION_DISMISS_TESTID}
            >
              {DISMISS_LABEL}
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              className={TOUCH_TARGET}
              disabled={isPending}
              aria-busy={isPending}
              data-testid={DELETE_PRESENTATION_CONFIRM_TESTID}
            >
              {isPending ? CONFIRM_PENDING_LABEL : CONFIRM_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
