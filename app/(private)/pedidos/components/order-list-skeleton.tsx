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
 * Estado «cargando» de la lista de pedidos (R21, `design.md > 5`).
 *
 * Se pinta como `fallback` del `<Suspense>` de la pagina, con `rows` = el tamano de pagina
 * pedido: asi el salto de altura al llegar los datos es el minimo posible y el esqueleto dice la
 * verdad sobre cuanto se esta pidiendo. La `key` del `<Suspense>` es lo que hace que reaparezca
 * en **cada** cambio de pagina, orden o filtro, y no solo en la primera carga.
 *
 * **Se pinta FUERA de `<DataTable>`, no con su prop `status`** (alternativa Q, descartada): el
 * «cargando» lo aporta el `<Suspense>` del servidor, que es el mecanismo del repo; alimentar
 * `status` obligaria a mantener un estado de carga en cliente en paralelo al del servidor, o sea
 * dos verdades sobre lo mismo.
 *
 * `role="status"` + `aria-busy`: quien usa lector de pantalla oye que algo se esta cargando en
 * lugar de encontrarse una tabla vacia, que es justo lo que R21 prohibe confundir.
 */

/**
 * Cuantas celdas por fila pinta el esqueleto. Son las DIEZ columnas de `design.md > 7` (eran
 * diez hasta el 2026-09-07: la unidad y el precio unitario salieron del pedido; el 2026-09-13
 * QC-102 anade la de RESPONSABLES, R22).
 *
 * **QC-102 R22**: el esqueleto y la tabla declaran el MISMO numero de columnas, de modo que
 * resolverse la carga no cambie cuantas columnas hay y la pantalla no de un salto.
 *
 * **No se importa `ORDER_COLUMNS`** (T7) a proposito: esa declaracion vive en un modulo de
 * **cliente** —sus celdas devuelven elementos y funciones— y este esqueleto lo renderiza un
 * Server Component. Para que el numero no se quede atras en silencio, T7 anade el test que ata
 * esta constante a `ORDER_COLUMNS.length`.
 */
export const ORDER_SKELETON_COLUMN_COUNT = 10;

export function OrderListSkeleton({ rows }: { readonly rows: number }) {
  const columns = Array.from({ length: ORDER_SKELETON_COLUMN_COUNT }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid="order-list-skeleton">
      <span className="sr-only">Cargando pedidos…</span>
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
            <TableRow key={index} data-testid="order-row-skeleton">
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
