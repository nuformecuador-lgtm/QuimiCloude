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
 * Estado «cargando» de la lista de usuarios (R19, `design.md > 6`).
 *
 * Se pinta como `fallback` del `<Suspense>` de la pagina, con `rows` = el tamano de pagina pedido:
 * asi el salto de altura al llegar los datos es el minimo posible y el esqueleto dice la verdad
 * sobre cuanto se esta pidiendo. **La `key` del `<Suspense>` es lo que hace que reaparezca en cada
 * cambio** de pagina, tamano, orden, filtro o busqueda, y no solo en la primera carga.
 *
 * **Se pinta FUERA de `<DataTable>`, no con su prop `status`**: el «cargando» lo aporta el
 * `<Suspense>` del servidor, que es el mecanismo del repo; alimentar `status` obligaria a mantener
 * un estado de carga en cliente en paralelo al del servidor, o sea dos verdades sobre lo mismo.
 *
 * `role="status"` + `aria-busy`: quien usa lector de pantalla oye que algo se esta cargando en
 * lugar de encontrarse una tabla vacia, que es justo lo que R18 y R19 prohiben confundir.
 */

export const USER_LIST_SKELETON_TESTID = 'user-list-skeleton';
export const USER_ROW_SKELETON_TESTID = 'user-row-skeleton';

/**
 * Cuantas celdas por fila pinta el esqueleto: las SEIS columnas de `design.md > 7`.
 *
 * **No se importa `USER_COLUMN_COUNT`** a proposito: esa declaracion vive en un modulo de
 * **cliente** —su celda de acciones devuelve elementos— y este esqueleto lo renderiza un Server
 * Component. Para que el numero no se quede atras en silencio, el test lo ata a la constante real
 * de `user-columns.tsx`. Mismo criterio que `unit-list-skeleton.tsx`.
 */
export const USER_SKELETON_COLUMN_COUNT = 6;

export function UserListSkeleton({ rows }: { readonly rows: number }) {
  const columns = Array.from({ length: USER_SKELETON_COLUMN_COUNT }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid={USER_LIST_SKELETON_TESTID}>
      <span className="sr-only">Cargando usuarios…</span>
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
            <TableRow key={index} data-testid={USER_ROW_SKELETON_TESTID}>
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
