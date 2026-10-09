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
import { ErrorAlert } from '@/components/shared/error-alert';
import { Button } from '@/components/ui/button';
import type { SupplierView } from '@/lib/modules/proveedores';
import {
  deleteSupplierAction,
  type SupplierMutationFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';
import { touchTarget } from '@/lib/shared/ui/touch-target';

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
            className={touchTarget}
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

        {state.status !== 'error' ? null : (
          <ErrorAlert
            error={state}
            cataloguedAs="p"
            className="text-sm text-destructive"
            testId="delete-supplier-error"
          />
        )}

        <form action={formAction}>
          <input
            type="hidden"
            name="id"
            defaultValue={supplier.id}
            data-testid="delete-supplier-id"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className={touchTarget} data-testid="delete-supplier-cancel">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              touch
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
