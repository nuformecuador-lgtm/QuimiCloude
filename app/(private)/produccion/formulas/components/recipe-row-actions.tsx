'use client';

import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';
import type { RecipeSummary } from '@/lib/modules/recetas';
import { recipeEditRoute } from '@/lib/shared/routes';

import { DeleteRecipeDialog } from './delete-recipe-dialog';

/**
 * Las dos acciones de fila de una receta, editar y borrar, en el menu de tres puntos de la fila.
 *
 * Editar es un enlace a la pagina de la receta, no abre panel. Borrar abre el dialogo de esta
 * fila, que queda siempre montado y se abre y cierra por estado: asi su salida anima.
 *
 * El disparador nombra a la receta en su nombre accesible; los items dicen solo el verbo.
 */

export const RECIPE_ROW_ACTIONS_TESTID = 'recipe-row-actions';
export const RECIPE_ACTION_EDIT_TESTID = 'recipe-edit-open';
export const RECIPE_ACTION_DELETE_TESTID = 'recipe-delete-open';

const EDIT_ACTION_LABEL = 'Editar';
const DELETE_ACTION_LABEL = 'Borrar';

/** Nombre accesible del disparador del menu de la fila. */
export function recipeRowActionsLabel(name: string): string {
  return `Acciones de ${name}`;
}

export type RecipeRowActionsProps = {
  readonly recipe: RecipeSummary;
};

export function RecipeRowActions({ recipe }: RecipeRowActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const items: RowActionMenuItem[] = [
    {
      key: 'edit',
      label: EDIT_ACTION_LABEL,
      icon: PencilIcon,
      href: recipeEditRoute(recipe.id),
      testId: RECIPE_ACTION_EDIT_TESTID,
    },
    {
      key: 'delete',
      label: DELETE_ACTION_LABEL,
      icon: Trash2Icon,
      onSelect: () => setDeleteOpen(true),
      destructive: true,
      testId: RECIPE_ACTION_DELETE_TESTID,
    },
  ];

  return (
    <>
      <RowActionsMenu
        items={items}
        triggerLabel={recipeRowActionsLabel(recipe.name)}
        triggerTestId={RECIPE_ROW_ACTIONS_TESTID}
        triggerDataAttributes={{ 'data-recipe-id': recipe.id }}
      />
      <DeleteRecipeDialog recipe={recipe} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
