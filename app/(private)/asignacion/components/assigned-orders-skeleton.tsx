import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Estado «cargando» de la lista de pedidos asignados (R30, `design.md > 8.1`).
 *
 * Se pinta como `fallback` del `<Suspense>` de la pagina, con `rows` = el tamano de pagina pedido
 * (R30). `role="status"` + `aria-busy`: quien usa lector de pantalla oye que algo se esta
 * cargando en lugar de encontrarse una tabla vacia.
 *
 * **Se pinta FUERA de `<DataTable>`**, igual que `order-list-skeleton.tsx` (alternativa Q,
 * descartada de `pedidos`): el «cargando» lo aporta el `<Suspense>` del servidor.
 */

/**
 * Cuantas celdas por fila pinta el esqueleto: las SIETE columnas de `design.md > 8.2`. Un test
 * ata esta cifra a `buildAssignedOrdersColumns().length` (precedente: `order-list-skeleton.tsx`).
 */
export const ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT = 7;

export function AssignedOrdersSkeleton({ rows }: { readonly rows: number }) {
  const columns = Array.from({ length: ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid="assigned-orders-skeleton">
      <span className="sr-only">Cargando pedidos asignados…</span>
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
            <TableRow key={index} data-testid="assigned-order-row-skeleton">
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
