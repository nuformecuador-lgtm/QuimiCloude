'use client';

import type { ReactNode } from 'react';

import type { DataTableColumn } from '@/components/shared/data-table';
import { EntityImage } from '@/components/shared/entity-image';
import type { RecipeSummary } from '@/lib/modules/recetas';

/** Marca de "sin dato". Constante para que ningun test dependa del glifo. */
export const EMPTY_CELL = '—';

/** Id de la columna de la miniatura: no es un campo de `RecipeSummary`, es marcado. */
export const IMAGE_COLUMN_ID = 'image';

/** Id de la columna de acciones: tampoco es un campo. */
export const ACTIONS_COLUMN_ID = 'actions';

export const IMAGE_COLUMN_LABEL = 'Imagen';
export const ACTIONS_COLUMN_LABEL = 'Acciones';

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

/** Defecto: si el usuario ya guardo su propio fijado para esta tabla, gana el suyo. */
export const RECIPE_DEFAULT_PINNED_COLUMNS: readonly string[] = [IMAGE_COLUMN_ID];

/**
 * UTC y no `toLocaleDateString`: servidor y navegador tienen husos distintos y la fecha local
 * provoca un desajuste de hidratacion.
 */
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export type RecipeColumnsDeps = {
  /** Slot: quien monta la tabla enchufa el enlace de edicion y el dialogo de borrado. */
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
      cell: (recipe) => recipe.name,
    },
    {
      id: 'stepCount',
      label: 'Pasos',
      align: 'end',
      cell: (recipe) => String(recipe.stepCount),
    },
    {
      id: 'createdAt',
      label: 'Creado',
      align: 'start',
      sortable: true,
      filter: { kind: 'dateRange' },
      cell: (recipe) => formatDate(recipe.createdAt),
    },
    {
      id: 'updatedAt',
      label: 'Actualizado',
      align: 'start',
      sortable: true,
      cell: (recipe) => formatDate(recipe.updatedAt),
    },
    {
      id: ACTIONS_COLUMN_ID,
      label: ACTIONS_COLUMN_LABEL,
      align: 'end',
      // Fijarla dejaria las acciones tapando las columnas de datos en pantallas angostas.
      pinnable: false,
      cell: (recipe) => <div className="flex justify-end gap-1">{rowActions(recipe)}</div>,
    },
  ];
}
