import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { RECIPE_COLUMNS } from './recipe-columns';

/**
 * Estado "cargando" de la lista (R16, `design.md > 4.3`).
 *
 * Se pinta como `fallback` del `<Suspense>` de la pagina, con `rows` = el tamano de pagina
 * pedido: asi el salto de altura al llegar los datos es el minimo posible y el esqueleto dice la
 * verdad sobre cuanto se esta pidiendo. Reutiliza la MISMA declaracion de columnas que la tabla,
 * de modo que no puede quedarse atras cuando se anada una.
 *
 * `role="status"` + `aria-busy`: quien usa lector de pantalla oye que algo se esta cargando en
 * lugar de encontrarse una tabla vacia (que es lo que R16 prohibe confundir).
 */
export function RecipeTableSkeleton({ rows }: { readonly rows: number }) {
  return (
    <div role="status" aria-busy="true" data-testid="recipe-table-skeleton">
      <span className="sr-only">Cargando recetas…</span>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Imagen</TableHead>
            {RECIPE_COLUMNS.map((column) => (
              <TableHead key={column.key} scope="col">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => index).map((index) => (
            <TableRow key={index} data-testid="recipe-row-skeleton">
              <TableCell>
                <Skeleton className="h-10 w-10" />
              </TableCell>
              {RECIPE_COLUMNS.map((column) => (
                <TableCell key={column.key}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
