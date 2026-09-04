import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RecipeSummary } from '@/lib/modules/recetas';
import { recipeEditRoute } from '@/lib/shared/routes';

import { DeleteRecipeDialog } from './delete-recipe-dialog';
import { RECIPE_COLUMNS } from './recipe-columns';

/**
 * Tabla del catalogo de recetas (R8, R9, R18, R19, `design.md > 4.3`).
 *
 * **Sin `'use client'`**: no tiene estado ni manejadores propios. Recibe las recetas por props
 * desde `RecipeListSection`, que es quien llama a la operacion de consulta (R10). Cada accion de
 * fila es un componente independiente -el enlace de edicion es solo navegacion y el borrado es
 * su propio componente de cliente-, asi que la tabla no necesita coordinar nada.
 *
 * **La imagen se pinta con `imageUrl` TAL CUAL** (R18): ninguna URL se compone, deriva ni
 * concatena aqui. Sin imagen, se pinta un marcador identificable y **no** se emite un `<img>`
 * con `src` vacio.
 *
 * **R19 lo cumple el primitivo, no una clase escrita aqui**: `components/ui/table.tsx` envuelve
 * el `<table>` en un `div[data-slot=table-container]` con `overflow-x-auto`. El desbordamiento
 * horizontal lo absorbe ese envoltorio y **ningun ancestro** de la pantalla declara scroll
 * horizontal ni `100vh`. No se edita el primitivo (R48) ni se anade columna pegajosa.
 *
 * **R10 ampliado**: esta tabla no pinta ninguna marca de linea con producto de baja -no tiene
 * de donde sacarla, `RecipeSummary` no trae lineas- y no invoca la operacion de detalle.
 */
export const ACTIONS_COLUMN_LABEL = 'Acciones';

const TOUCH_TARGET = 'min-h-11 min-w-11';

export function RecipeTable({ recipes }: { readonly recipes: readonly RecipeSummary[] }) {
  return (
    <Table data-testid="recipe-table">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" data-testid="recipe-column-image" className="text-left">
            Imagen
          </TableHead>
          {RECIPE_COLUMNS.map((column) => (
            <TableHead
              key={column.key}
              data-testid={column.testId}
              className={column.align === 'end' ? 'text-right' : 'text-left'}
              scope="col"
            >
              {column.label}
            </TableHead>
          ))}
          <TableHead scope="col" data-testid="recipe-column-actions" className="text-right">
            {ACTIONS_COLUMN_LABEL}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipes.map((recipe) => (
          <TableRow key={recipe.id} data-testid="recipe-row">
            <TableCell data-testid="recipe-cell-image">
              {recipe.imageUrl === null ? (
                <span
                  data-testid="recipe-image-placeholder"
                  className="text-sm text-muted-foreground"
                >
                  Sin imagen
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- direccion ya compuesta por el backend (R18), sin optimizacion propia
                <img
                  src={recipe.imageUrl}
                  alt=""
                  className="h-10 w-10 rounded object-cover"
                  data-testid="recipe-image"
                />
              )}
            </TableCell>
            {RECIPE_COLUMNS.map((column) => (
              <TableCell
                key={column.key}
                data-testid={`recipe-cell-${column.key}`}
                className={column.align === 'end' ? 'text-right tabular-nums' : 'text-left'}
              >
                {column.value(recipe)}
              </TableCell>
            ))}
            {/*
              Las acciones van en la ultima columna y se alcanzan con el scroll de la propia
              tabla. **Siempre visibles**: nada de revelarlas con `:hover`, que en tactil no
              existe (R50).
            */}
            <TableCell className="text-right" data-testid="recipe-cell-actions">
              <div className="flex justify-end gap-1">
                <Link
                  href={recipeEditRoute(recipe.id)}
                  className={`${TOUCH_TARGET} inline-flex items-center justify-center rounded-lg px-2 text-sm hover:bg-muted`}
                  aria-label={`Editar ${recipe.name}`}
                  data-testid="recipe-edit-open"
                >
                  Editar
                </Link>
                <DeleteRecipeDialog recipe={recipe} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
