'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { useRateLimitedActionState } from '@/hooks/use-rate-limited-action-state';
import { Button } from '@/components/ui/button';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
import type { SupplierView } from '@/lib/modules/proveedores';
import {
  deleteSupplierAction,
  type SupplierMutationFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const DELETE_SUCCESS = 'Proveedor dado de baja.';

const INITIAL_STATE: SupplierMutationFormState = { status: 'idle' };

/**
 * Confirmacion de la baja de un proveedor (R35, R33, R47, `design.md > 7`).
 *
 * **El dialogo NOMBRA al proveedor**, avisa de que **sus lineas de catalogo se dan de baja con
 * el** y dice que la accion no se puede deshacer. Las tres cosas son requisito, no adorno: la
 * baja arrastra las lineas vivas del proveedor en una sola transaccion
 * (`supplier-prisma.ts > deleteSupplier`), y quien pulsa «dar de baja» sobre un proveedor no
 * tiene por que suponer que ademas se lleva su catalogo. En base es borrado logico
 * (`deletedAt`), pero el backend **no expone ninguna forma de restaurar**: para quien lo usa es
 * irreversible, y se le dice asi en vez de prometerle una vuelta atras que no existe.
 *
 * **El aviso del arrastre tiene su propio `data-testid`** (`delete-supplier-cascade`) para que
 * el test lo afirme por identificador y no por su copy (R47): el texto puede reescribirse; que
 * el aviso exista, no.
 *
 * **Sin confirmar no se invoca NADA** (R35): la operacion sale del `submit` del formulario del
 * dialogo, que solo existe dentro de su contenido y solo se envia al pulsar el boton de
 * confirmar. El `id` viaja en un campo oculto, que es la forma que `deleteSupplierAction`
 * espera —lo dice su propia cabecera— y por eso no necesita `bind`.
 *
 * Con exito se cierra, se avisa por toast sobre la region que el layout privado ya monta (R34,
 * **no se monta otra**) y se refresca la lista con `router.refresh()` (R33). Con error el
 * dialogo **sigue abierto** con el mensaje a la vista: cerrarlo dejaria al usuario creyendo que
 * el proveedor se dio de baja.
 */
export function DeleteSupplierDialog({ supplier }: { readonly supplier: SupplierView }) {
  const [requestedOpen, setRequestedOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useRateLimitedActionState(deleteSupplierAction, INITIAL_STATE);

  /*
    El dialogo abierto se DERIVA de dos cosas: lo que pidio el usuario y el resultado de la
    operacion. Una baja con exito lo cierra sin necesidad de un `setState` dentro de un efecto
    -que es lo que `react-hooks/set-state-in-effect` prohibe, y con razon: es un render de mas y
    una via facil para un bucle-.
  */
  const open = requestedOpen && state.status !== 'success';

  useEffect(() => {
    if (state.status !== 'success') return;
    toast.success(DELETE_SUCCESS);
    router.refresh();
  }, [state, router]);

  return (
    <AlertDialog open={open} onOpenChange={(next) => setRequestedOpen(next)}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            className={TOUCH_TARGET}
            aria-label={`Dar de baja ${supplier.name}`}
            data-testid="supplier-delete-open"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="delete-supplier-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Dar de baja el proveedor</AlertDialogTitle>
          <AlertDialogDescription data-testid="delete-supplier-message">
            Se va a dar de baja «{supplier.name}». Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className="text-sm text-muted-foreground" data-testid="delete-supplier-cascade">
          Sus líneas de catálogo se dan de baja con él.
        </p>

        {/*
          QC-71 (R17, R18): el INESPERADO lo pinta el componente compartido -que necesita un
          contenedor de bloque-; el CATALOGADO, exactamente como siempre y sin identificador.
        */}
        {state.status !== 'error' ? null : state.code === UNEXPECTED_ERROR_CODE ? (
          <div
            role="alert"
            className="text-sm text-destructive"
            data-testid="delete-supplier-error"
          >
            <UnexpectedErrorNotice state={state} />
          </div>
        ) : (
          <p role="alert" className="text-sm text-destructive" data-testid="delete-supplier-error">
            {state.message}
          </p>
        )}

        <form action={formAction}>
          <input
            type="hidden"
            name="id"
            defaultValue={supplier.id}
            data-testid="delete-supplier-id"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className={TOUCH_TARGET} data-testid="delete-supplier-cancel">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              className={TOUCH_TARGET}
              data-testid="delete-supplier-confirm"
            >
              Dar de baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
