'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
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
import type { ErrorState } from '@/lib/modules/errores';
import {
  deleteRecipeAction,
  listRecipeVersionsAction,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { touchTarget } from '@/lib/shared/ui/touch-target';

const DELETE_SUCCESS = 'Receta borrada.';
const DELETE_VERSION_SUCCESS = 'Versión borrada.';

type DeleteKind = 'recipe' | 'version';

type VersionCount =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly count: number };

function versionsNotice(count: number): string | null {
  if (count === 0) return null;
  if (count === 1) return 'También se borrará su versión.';
  return `También se borrarán sus ${count} versiones.`;
}

export function DeleteRecipeDialog({
  recipe,
  kind = 'recipe',
}: {
  readonly recipe: { readonly id: string; readonly name: string };
  readonly kind?: DeleteKind;
}) {
  const [open, setOpen] = useState(false);
  /*
    El error, ENTERO. QC-71 (R17): era `{ code, message }` copiado a mano, y esa copia perdia el
    `reference` del error inesperado. Un `reference?: string` local reabriria el agujero por el
    otro lado, asi que se guarda la union cerrada y el render estrecha por `code`.
  */
  const [error, setError] = useState<ErrorState | null>(null);
  const [versionCount, setVersionCount] = useState<VersionCount>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Una respuesta lenta de una apertura anterior no debe pisar la cuenta de la actual.
  const countRequestRef = useRef(0);

  const isVersion = kind === 'version';

  const startCount = () => {
    const requestId = ++countRequestRef.current;
    setVersionCount({ status: 'loading' });
    void listRecipeVersionsAction(recipe.id).then((result) => {
      if (requestId !== countRequestRef.current) return;
      if (result.status === 'error') {
        setVersionCount({ status: 'idle' });
        setError(result);
        return;
      }
      setVersionCount({ status: 'ready', count: result.data.length });
    });
  };

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await deleteRecipeAction(recipe.id);
      if (result.status === 'error') {
        setError(result);
        return;
      }
      setError(null);
      setOpen(false);
      toast.success(isVersion ? DELETE_VERSION_SUCCESS : DELETE_SUCCESS);
      router.refresh();
    });
  };

  // Sin cuenta fiable no se deja confirmar: borraria versiones que el usuario no ha visto anunciadas.
  const countBlocksConfirm = !isVersion && versionCount.status !== 'ready';
  const notice =
    !isVersion && versionCount.status === 'ready' ? versionsNotice(versionCount.count) : null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          if (!isVersion) startCount();
        } else {
          countRequestRef.current++;
          setVersionCount({ status: 'idle' });
        }
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            touch
            aria-label={`Borrar ${recipe.name}`}
            data-testid="recipe-delete-open"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="delete-recipe-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{isVersion ? 'Borrar versión' : 'Borrar receta'}</AlertDialogTitle>
          <AlertDialogDescription data-testid="delete-recipe-message">
            {isVersion
              ? `Se va a borrar la versión «${recipe.name}». Esta acción no se puede deshacer.`
              : `Se va a borrar «${recipe.name}». Esta acción no se puede deshacer.`}
            {notice === null ? null : (
              <>
                {' '}
                <span data-testid="delete-recipe-versions-notice">{notice}</span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error === null ? null : (
          <ErrorAlert
            error={error}
            cataloguedAs="p"
            className="text-sm text-destructive"
            testId="delete-recipe-error"
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className={touchTarget} data-testid="delete-recipe-cancel">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className={touchTarget}
            disabled={isPending || countBlocksConfirm}
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
