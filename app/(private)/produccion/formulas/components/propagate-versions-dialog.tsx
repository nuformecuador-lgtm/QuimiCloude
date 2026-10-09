'use client';

import { useId, useState } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { RecipeVersionSummary } from '@/lib/modules/recetas';
import { touchTarget } from '@/lib/shared/ui/touch-target';

const DESCRIPTION = 'Marca las versiones que deben recibir este cambio en sus líneas.';
const PROPAGATE_LABEL = 'Guardar y propagar';
const SAVE_WITHOUT_LABEL = 'Guardar sin propagar';
const CANCEL_LABEL = 'Cancelar';

function dialogTitle(count: number): string {
  return count === 1 ? '1 versión parte de esta receta' : `${count} versiones parten de esta receta`;
}

export type PropagateVersionsDialogProps = {
  readonly open: boolean;
  readonly versions: readonly Pick<RecipeVersionSummary, 'id' | 'name'>[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (propagateToVersionIds: readonly string[]) => void;
};

export function PropagateVersionsDialog({
  open,
  versions,
  onOpenChange,
  onSave,
}: PropagateVersionsDialogProps) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(versions.map((version) => version.id)),
  );
  const [wasOpen, setWasOpen] = useState(open);
  const idPrefix = useId();

  // Cada apertura arranca con todas marcadas, aunque la anterior se cerrase con alguna desmarcada.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChecked(new Set(versions.map((version) => version.id)));
  }

  const toggle = (id: string, isChecked: boolean) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (isChecked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // Se envian en el orden de la lista, no en el de los clics.
  const selectedIds = versions.filter((version) => checked.has(version.id)).map((version) => version.id);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-testid="propagate-versions-dialog"
        className="flex max-h-[85dvh] flex-col"
      >
        <AlertDialogHeader>
          <AlertDialogTitle data-testid="propagate-versions-title">
            {dialogTitle(versions.length)}
          </AlertDialogTitle>
          <AlertDialogDescription>{DESCRIPTION}</AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="propagate-versions-list">
          {versions.map((version) => {
            const labelId = `${idPrefix}-${version.id}`;
            return (
              <li key={version.id}>
                <label
                  className={`flex ${touchTarget} cursor-pointer items-center gap-3 text-base`}
                  data-testid="propagate-version-row"
                >
                  <Checkbox
                    className={`${touchTarget} shrink-0`}
                    aria-labelledby={labelId}
                    checked={checked.has(version.id)}
                    onCheckedChange={(isChecked: boolean) => toggle(version.id, isChecked)}
                    data-testid="propagate-version-checkbox"
                    data-version-id={version.id}
                  />
                  <span id={labelId}>{version.name}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel className={touchTarget} data-testid="propagate-versions-cancel">
            {CANCEL_LABEL}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            touch
            onClick={() => onSave([])}
            data-testid="propagate-versions-skip"
          >
            {SAVE_WITHOUT_LABEL}
          </Button>
          <Button
            type="button"
            touch
            disabled={selectedIds.length === 0}
            onClick={() => onSave(selectedIds)}
            data-testid="propagate-versions-confirm"
          >
            {PROPAGATE_LABEL}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
