'use client';

import type { ReactNode } from 'react';

import { actionsColumn, type DataTableColumn } from '@/components/shared/data-table';
import { EntityImage } from '@/components/shared/entity-image';
import type { RecipeSummary } from '@/lib/modules/recetas';
import { formatCivilDate } from '@/lib/shared/ui/date-civil';

/** Id de la columna de la miniatura: no es un campo de `RecipeSummary`, es marcado. */
export const IMAGE_COLUMN_ID = 'image';

/** Id de la columna de acciones: tampoco es un campo. */
export const ACTIONS_COLUMN_ID = 'actions';

const IMAGE_COLUMN_LABEL = 'Imagen';
const ACTIONS_COLUMN_LABEL = 'Acciones';

/**
 * Los ids de autoria no se resuelven a nombres y pintarlos seria mostrar un UUID; la descripcion
 * ensanchaba la tabla con hasta 500 caracteres en una sola linea. `imageUrl` se pinta como
 * miniatura en `image`, nunca como texto. Excluirlos aqui hace que declarar su columna no compile.
 */
type HiddenRecipeField = 'id' | 'createdBy' | 'updatedBy' | 'imageUrl' | 'description';

export type RecipeColumnId =
  | Exclude<keyof RecipeSummary, HiddenRecipeField>
  | typeof IMAGE_COLUMN_ID
  | typeof ACTIONS_COLUMN_ID;

export type RecipeColumn = DataTableColumn<RecipeSummary> & { readonly id: RecipeColumnId };

export type RecipeColumnsDeps = {
  /** Slot: quien monta la tabla enchufa el menu de acciones de la fila. */
  readonly rowActions: (recipe: RecipeSummary) => ReactNode;
};

/**
 * Factoria y no array del modulo porque las acciones son componentes de cliente que llegan por
 * parametro. `sortable` y `filter` replican `RECIPE_QUERYABLE`: una cabecera ordenable que el
 * servidor ignora seria un control que miente.
 */
export function buildRecipeColumns({ rowActions }: RecipeColumnsDeps): readonly RecipeColumn[] {
  return [
    {
      id: IMAGE_COLUMN_ID,
      label: IMAGE_COLUMN_LABEL,
      align: 'start',
      // Nace fijada: es un defecto, con preferencia guardada gana la del usuario.
      defaultPinned: 'left',
      // La URL se usa tal cual; sin ella el componente pinta el marcador, nunca un `src` vacio.
      cell: (recipe) => (
        <EntityImage
          path={recipe.imageUrl}
          name={recipe.name}
          testId={recipe.imageUrl === null ? 'recipe-image-placeholder' : 'recipe-image'}
        />
      ),
    },
    {
      id: 'name',
      label: 'Nombre',
      align: 'start',
      sortable: true,
      width: 500,
      hideText: false,
      cell: (recipe) => recipe.name,
    },
    {
      id: 'stepCount',
      label: 'Pasos',
      align: 'center',
      cell: (recipe) => String(recipe.stepCount),
    },
    {
      id: 'createdAt',
      label: 'Creado',
      tabular: true,
      align: 'start',
      sortable: true,
      filter: { kind: 'dateRange' },
      cell: (recipe) => formatCivilDate(recipe.createdAt),
    },
    {
      id: 'updatedAt',
      label: 'Actualizado',
      tabular: true,
      align: 'start',
      sortable: true,
      cell: (recipe) => formatCivilDate(recipe.updatedAt),
    },
    {
      ...actionsColumn<RecipeSummary>({ label: ACTIONS_COLUMN_LABEL, cell: rowActions }),
      id: ACTIONS_COLUMN_ID,
    },
  ];
}
