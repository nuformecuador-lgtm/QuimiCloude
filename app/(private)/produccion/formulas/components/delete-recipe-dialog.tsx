'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
import { withRateLimitNotice } from '@/hooks/use-rate-limited-action-state';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { deleteRecipeAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { RecipeSummary } from '@/lib/modules/recetas';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const DELETE_SUCCESS = 'Receta borrada.';

/**
 * Confirmacion de borrado (R39, R24, `design.md > 4.3`).
 *
 * **El dialogo NOMBRA la receta** y dice que la accion no se puede deshacer. En base el borrado
 * es logico, pero el backend **no expone ninguna forma de restaurar**: para quien lo usa es
 * irreversible, y se le dice asi en vez de prometerle una vuelta atras que no existe.
 *
 * **Sin confirmar no se invoca nada**: `deleteRecipeAction(id)` sale ÚNICAMENTE del manejador
 * del boton de confirmar, dentro de `useTransition`. A diferencia de `DeleteProductDialog`
 * (QC-22), esta operacion **no** recibe `prevState` ni `FormData` -es un argumento tipado, como
 * el resto de las Server Actions de `recetas`- asi que no hay `useActionState` que encaje: el
 * estado de exito/error se maneja a mano y se prueba llamando exactamente una vez al confirmar.
 *
 * Con exito se cierra, se avisa por toast y se refresca la lista (R24). Con error el dialogo
 * **sigue abierto** con el mensaje a la vista: cerrarlo dejaria al usuario creyendo que se borro.
 */
export function DeleteRecipeDialog({ recipe }: { readonly recipe: RecipeSummary }) {
  const [open, setOpen] = useState(false);
  /*
    El error, ENTERO. QC-71 (R17): era `{ code, message }` copiado a mano, y esa copia perdia el
    `reference` del error inesperado. Un `reference?: string` local reabriria el agujero por el
    otro lado, asi que se guarda la union cerrada y el render estrecha por `code`.
  */
  const [error, setError] = useState<ErrorState | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await withRateLimitNotice(deleteRecipeAction)(recipe.id);
      if (result === undefined) return;
      if (result.status === 'error') {
        setError(result);
        return;
      }
      setError(null);
      setOpen(false);
      toast.success(DELETE_SUCCESS);
      router.refresh();
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            className={TOUCH_TARGET}
            aria-label={`Borrar ${recipe.name}`}
            data-testid="recipe-delete-open"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="delete-recipe-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Borrar receta</AlertDialogTitle>
          <AlertDialogDescription data-testid="delete-recipe-message">
            Se va a borrar «{recipe.name}». Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/*
          QC-71 (R17, R18): el INESPERADO lo pinta el componente compartido -que necesita un
          contenedor de bloque-; el CATALOGADO, exactamente como siempre y sin identificador.
        */}
        {error === null ? null : error.code === UNEXPECTED_ERROR_CODE ? (
          <div role="alert" className="text-sm text-destructive" data-testid="delete-recipe-error">
            <UnexpectedErrorNotice state={error} />
          </div>
        ) : (
          <p role="alert" className="text-sm text-destructive" data-testid="delete-recipe-error">
            {error.message}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className={TOUCH_TARGET} data-testid="delete-recipe-cancel">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className={TOUCH_TARGET}
            disabled={isPending}
            data-testid="delete-recipe-confirm"
            onClick={handleConfirm}
          >
            Borrar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
