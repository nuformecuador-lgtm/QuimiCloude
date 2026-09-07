import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { PRODUCT_SKELETON_COLUMN_COUNT } from './product-columns-skeleton';

/**
 * Estado "cargando" de la lista (R15, `design.md > 4.3`).
 *
 * Se pinta como `fallback` del `<Suspense>` de la pagina, con `rows` = el tamano de pagina
 * pedido: asi el salto de altura al llegar los datos es el minimo posible y el esqueleto dice la
 * verdad sobre cuanto se esta pidiendo. Reutiliza la MISMA declaracion de columnas que la tabla,
 * de modo que no puede quedarse atras cuando se anada una.
 *
 * `role="status"` + `aria-busy`: quien usa lector de pantalla oye que algo se esta cargando en
 * lugar de encontrarse una tabla vacia (que es lo que R16 prohibe confundir).
 *
 * **Desde el 2026-09-07 NO importa la declaracion de columnas** y por eso cuenta con una
 * constante: esa declaracion es ahora una FACTORIA de cliente -sus celdas montan el panel de
 * edicion-, y este esqueleto lo pinta un Server Component. Importarla arrastraria la frontera de
 * cliente a la pagina entera. La constante vive en `product-columns-skeleton.ts` y su test la ata
 * al numero real de columnas, para que no pueda quedarse atras.
 */
export function ProductTableSkeleton({ rows }: { readonly rows: number }) {
  const celdas = Array.from({ length: PRODUCT_SKELETON_COLUMN_COUNT }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid="product-table-skeleton">
      <span className="sr-only">Cargando productos…</span>
      <Table>
        <TableHeader>
          <TableRow>
            {celdas.map((celda) => (
              <TableHead key={celda} scope="col">
                <Skeleton className="h-4 w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => index).map((index) => (
            <TableRow key={index} data-testid="product-row-skeleton">
              {celdas.map((celda) => (
                <TableCell key={celda}>
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
