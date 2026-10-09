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
import {
  deleteProductAction,
  type ProductMutationFormState,
} from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { ProductView } from '@/lib/modules/inventario';
import { touchTarget } from '@/lib/shared/ui/touch-target';

const DELETE_SUCCESS = 'Producto borrado.';

const INITIAL_STATE: ProductMutationFormState = { status: 'idle' };

/**
 * Confirmacion de borrado (R26, R21, `design.md > 6`).
 *
 * **El dialogo NOMBRA el producto** y dice que la accion no se puede deshacer. En base el borrado
 * es logico (`deletedAt`), pero el backend **no expone ninguna forma de restaurar**: para quien lo
 * usa es irreversible, y se le dice asi en vez de prometerle una vuelta atras que no existe.
 *
 * **Sin confirmar no se invoca nada**: la operacion sale del `submit` del formulario del dialogo,
 * que solo existe dentro del contenido y solo se envia al pulsar el boton de confirmar. El `id`
 * viaja en un campo oculto, que es la forma que `deleteProductAction` espera.
 *
 * Con exito se cierra, se avisa por toast y se refresca la lista (R21). Con error el dialogo
 * **sigue abierto** con el mensaje a la vista: cerrarlo dejaria al usuario creyendo que se borro.
 */
export function DeleteProductDialog({ product }: { readonly product: ProductView }) {
  const [requestedOpen, setRequestedOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(deleteProductAction, INITIAL_STATE);

  /*
    El dialogo abierto se DERIVA de dos cosas: lo que pidio el usuario y el resultado de la
    operacion. Un borrado con exito lo cierra sin necesidad de un `setState` dentro de un efecto
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
            touch
            aria-label={`Borrar ${product.name}`}
            data-testid="product-delete-open"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="delete-product-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Borrar producto</AlertDialogTitle>
          <AlertDialogDescription data-testid="delete-product-message">
            Se va a borrar «{product.name}». Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state.status !== 'error' ? null : (
          <ErrorAlert
            error={state}
            cataloguedAs="p"
            className="text-sm text-destructive"
            testId="delete-product-error"
          />
        )}

        <form action={formAction}>
          <input type="hidden" name="id" defaultValue={product.id} data-testid="delete-product-id" />
          <AlertDialogFooter>
            <AlertDialogCancel className={touchTarget} data-testid="delete-product-cancel">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              touch
              data-testid="delete-product-confirm"
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
