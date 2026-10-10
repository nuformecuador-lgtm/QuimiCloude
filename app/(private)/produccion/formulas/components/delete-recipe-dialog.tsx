'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { Button } from '@/components/ui/button';
import type { ErrorState } from '@/lib/modules/errores';
import {
  deleteRecipeAction,
  listRecipeVersionsAction,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';

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

export type DeleteRecipeDialogProps = {
  readonly recipe: { readonly id: string; readonly name: string };
  readonly kind?: DeleteKind;
  /** Con `open` no se monta el disparador propio: la apertura la decide quien lo pasa. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
};

export function DeleteRecipeDialog({
  recipe,
  kind = 'recipe',
  open: controlledOpen,
  onOpenChange,
}: DeleteRecipeDialogProps) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  // En modo controlado la apertura llega por prop y no por un evento del dialogo.
  const [seenOpen, setSeenOpen] = useState(false);
  // El error entero y no una copia de `{ code, message }`: la copia perdería el `reference` del
  // error inesperado. El render estrecha por `code`.
  const [error, setError] = useState<ErrorState | null>(null);
  const [versionCount, setVersionCount] = useState<VersionCount>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Una respuesta lenta de una apertura anterior no debe pisar la cuenta de la actual.
  const countRequestRef = useRef(0);

  const isVersion = kind === 'version';

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  if (isControlled && open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setError(null);
      if (!isVersion) setVersionCount({ status: 'loading' });
    }
  }

  const requestCount = () => {
    const requestId = ++countRequestRef.current;
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

  const startCount = () => {
    setVersionCount({ status: 'loading' });
    requestCount();
  };

  const requestCountOnOpen = useEffectEvent(requestCount);

  useEffect(() => {
    if (isControlled && open && !isVersion) requestCountOnOpen();
  }, [isControlled, open, isVersion]);

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
    <DeleteConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !isControlled) {
          setError(null);
          if (!isVersion) startCount();
        } else if (!next) {
          countRequestRef.current++;
          setVersionCount({ status: 'idle' });
        }
      }}
      trigger={
        isControlled
          ? undefined
          : {
              render: (
                <Button
                  variant="ghost"
                  touch
                  aria-label={`Borrar ${recipe.name}`}
                  data-testid="recipe-delete-open"
                />
              ),
              children: <Trash2Icon />,
            }
      }
      texts={{
        title: isVersion ? 'Borrar versión' : 'Borrar receta',
        description: (
          <>
            {isVersion
              ? `Se va a borrar la versión «${recipe.name}». Esta acción no se puede deshacer.`
              : `Se va a borrar «${recipe.name}». Esta acción no se puede deshacer.`}
            {notice === null ? null : (
              <>
                {' '}
                <span data-testid="delete-recipe-versions-notice">{notice}</span>
              </>
            )}
          </>
        ),
        dismiss: 'Cancelar',
        confirm: 'Borrar',
      }}
      testIds={{
        dialog: 'delete-recipe-dialog',
        message: 'delete-recipe-message',
        dismiss: 'delete-recipe-cancel',
        confirm: 'delete-recipe-confirm',
        error: 'delete-recipe-error',
      }}
      submit={{ kind: 'transition', onConfirm: handleConfirm }}
      isPending={isPending}
      announceBusy={false}
      confirmDisabled={countBlocksConfirm}
      error={error ?? undefined}
      errorStyle="inline"
    />
  );
}
