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
import type { CatalogLineView } from '@/lib/modules/proveedores';
import {
  deleteCatalogLineAction,
  type CatalogLineMutationFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import { touchTarget } from '@/lib/shared/ui/touch-target';

const DELETE_SUCCESS = 'Línea de catálogo dada de baja.';

const INITIAL_STATE: CatalogLineMutationFormState = { status: 'idle' };

/**
 * Confirmacion de la baja de una linea de catalogo (R36, R33, R47; `design.md > 7`).
 *
 * **El dialogo NOMBRA la linea** y dice que la accion no se puede deshacer. Las dos cosas son
 * requisito, no adorno: en la base es borrado logico (`deletedAt`), pero el backend **no expone
 * ninguna forma de restaurar**, asi que para quien lo usa es irreversible y se le dice asi en vez
 * de prometerle una vuelta atras que no existe. A diferencia de la baja de un proveedor, esta
 * **no arrastra nada**: la linea es la hoja del arbol.
 *
 * **Sin confirmar no se invoca NADA** (R36): la operacion sale del `submit` del formulario del
 * dialogo, que solo existe dentro de su contenido y solo se envia al pulsar el boton de
 * confirmar. El `id` viaja en un campo oculto, que es la forma que `deleteCatalogLineAction`
 * espera -lo dice su propia cabecera- y por eso no necesita `bind`.
 *
 * Con exito se cierra, se avisa por toast sobre la region que el layout privado ya monta (R34,
 * **no se monta otra**) y se refresca el catalogo con `router.refresh()` (R33). Con error el
 * dialogo **sigue abierto** con el mensaje a la vista: cerrarlo dejaria al usuario creyendo que
 * la linea se dio de baja.
 */
export function DeleteCatalogLineDialog({ line }: { readonly line: CatalogLineView }) {
  const [requestedOpen, setRequestedOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(deleteCatalogLineAction, INITIAL_STATE);

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
            className={touchTarget}
            aria-label={`Dar de baja ${line.name}`}
            data-testid="catalog-line-delete-open"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="delete-catalog-line-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Dar de baja la línea</AlertDialogTitle>
          <AlertDialogDescription data-testid="delete-catalog-line-message">
            Se va a dar de baja «{line.name}». Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state.status !== 'error' ? null : (
          <ErrorAlert
            error={state}
            cataloguedAs="p"
            className="text-sm text-destructive"
            testId="delete-catalog-line-error"
          />
        )}

        <form action={formAction}>
          <input
            type="hidden"
            name="id"
            defaultValue={line.id}
            data-testid="delete-catalog-line-id"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className={touchTarget} data-testid="delete-catalog-line-cancel">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              touch
              data-testid="delete-catalog-line-confirm"
            >
              Dar de baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
