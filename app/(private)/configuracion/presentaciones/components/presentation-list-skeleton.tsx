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
 * Estado «cargando» de la lista de presentaciones (R16, `design.md > 5.3`).
 *
 * Se pinta como `fallback` del `<Suspense>` de la pagina, con `rows` = el tamano de pagina
 * pedido: asi el salto de altura al llegar los datos es el minimo posible y el esqueleto dice la
 * verdad sobre cuanto se esta pidiendo. La `key` del `<Suspense>` es lo que hace que reaparezca
 * en **cada** cambio de pagina, tamano, orden o busqueda, y no solo en la primera carga.
 *
 * **Se pinta FUERA de `<DataTable>`, no con su prop `status`** (`design.md > 5.3`): el «cargando»
 * lo aporta el `<Suspense>` del servidor, que es el mecanismo del repo; alimentar `status`
 * obligaria a mantener un estado de carga en cliente en paralelo al del servidor, o sea dos
 * verdades sobre lo mismo.
 *
 * `role="status"` + `aria-busy`: quien usa lector de pantalla oye que algo se esta cargando en
 * lugar de encontrarse una tabla vacia, que es justo lo que R15 y R16 prohiben confundir.
 */

export const PRESENTATION_LIST_SKELETON_TESTID = 'presentation-list-skeleton';
export const PRESENTATION_ROW_SKELETON_TESTID = 'presentation-row-skeleton';

/**
 * Cuantas celdas por fila pinta el esqueleto: las columnas de la lista de presentaciones.
 *
 * **No se importa `PRESENTATION_COLUMNS`** a proposito: esa declaracion vive en un modulo de
 * **cliente** —su celda de acciones devuelve elementos— y este esqueleto lo renderiza un Server
 * Component. Para que el numero no se quede atras en silencio, el test lo ata a
 * `PRESENTATION_COLUMNS.length`.
 */
export const PRESENTATION_SKELETON_COLUMN_COUNT = 3;

export function PresentationListSkeleton({ rows }: { readonly rows: number }) {
  const columns = Array.from({ length: PRESENTATION_SKELETON_COLUMN_COUNT }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid={PRESENTATION_LIST_SKELETON_TESTID}>
      <span className="sr-only">Cargando presentaciones…</span>
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
            <TableRow key={index} data-testid={PRESENTATION_ROW_SKELETON_TESTID}>
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
