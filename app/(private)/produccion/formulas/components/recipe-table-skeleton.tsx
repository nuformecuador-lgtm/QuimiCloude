import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { RECIPE_SKELETON_COLUMN_COUNT } from './recipe-columns-skeleton';

// Cuenta con una constante y no con las columnas: esas son una factoría de cliente y este
// esqueleto lo pinta el servidor como `fallback`.
export function RecipeTableSkeleton({ rows }: { readonly rows: number }) {
  const cells = Array.from({ length: RECIPE_SKELETON_COLUMN_COUNT }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid="recipe-table-skeleton">
      <span className="sr-only">Cargando recetas…</span>
      <Table>
        <TableHeader>
          <TableRow>
            {cells.map((cell) => (
              <TableHead key={cell} scope="col">
                <Skeleton className="h-4 w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => index).map((index) => (
            <TableRow key={index} data-testid="recipe-row-skeleton">
              {cells.map((cell) => (
                <TableCell key={cell}>
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
