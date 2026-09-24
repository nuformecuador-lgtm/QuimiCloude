'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
import type { SupplierView } from '@/lib/modules/proveedores';
import {
  deleteSupplierAction,
  type SupplierMutationFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const DELETE_SUCCESS = 'Proveedor dado de baja.';

const INITIAL_STATE: SupplierMutationFormState = { status: 'idle' };

/**
 * Confirmacion de la baja de un proveedor, montada en la cabecera de su detalle. Avisa del
 * arrastre de su catalogo. Con exito navega a la lista en vez de refrescar este mismo detalle,
 * que mostraria «no encontrado»; con error el dialogo sigue abierto con el mensaje a la vista.
 */
export function DeleteSupplierDialog({ supplier }: { readonly supplier: SupplierView }) {
  const [requestedOpen, setRequestedOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(deleteSupplierAction, INITIAL_STATE);

  // El dialogo abierto se deriva del pedido del usuario y del resultado de la operacion, para no
  // cerrar con un `setState` dentro de un efecto.
  const open = requestedOpen && state.status !== 'success';

  useEffect(() => {
    if (state.status !== 'success') return;
    toast.success(DELETE_SUCCESS);
    router.replace(SUPPLIERS_ROUTE);
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
