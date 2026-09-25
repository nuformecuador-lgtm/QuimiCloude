import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/**
 * Estado «cargando» de la lista de clientes (R21, `design.md > 5.2`).
 *
 * Se pinta como `fallback` del `<Suspense>` de la pagina, con `rows` = el tamano de pagina pedido.
 *
 * `role="status"` + `aria-busy`: quien usa lector de pantalla oye que algo se esta cargando en
 * lugar de encontrarse una tabla vacia, que es justo lo que R21 prohibe confundir.
 */

/**
 * Cuantas celdas por fila pinta el esqueleto: NUEVE, la misma cuenta que las columnas declaradas
 * en `customer-columns.tsx`. No se importa esa declaracion aqui a proposito: vive en un modulo de
 * cliente y este esqueleto lo renderiza un Server Component. Un test ata esta constante al largo
 * de `buildCustomerColumns(...)`.
 */
export const CUSTOMER_SKELETON_COLUMN_COUNT = 9;

export function CustomerListSkeleton({ rows }: { readonly rows: number }) {
  const columns = Array.from({ length: CUSTOMER_SKELETON_COLUMN_COUNT }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid="customer-list-skeleton">
      <span className="sr-only">Cargando clientes…</span>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} scope="col">
                <Skeleton className="h-4 w-full" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => index).map((index) => (
            <TableRow key={index} data-testid="customer-row-skeleton">
              {columns.map((column) => (
                <TableCell key={column}>
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
