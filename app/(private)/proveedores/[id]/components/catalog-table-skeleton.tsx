import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { CATALOG_COLUMNS } from './catalog-columns';

/**
 * Estado «cargando» del catalogo (R24, `design.md > 6.1`).
 *
 * Se pinta como `fallback` del `<Suspense>` de la pagina de detalle, con `rows` = el tamano de
 * pagina pedido: asi el salto de altura al llegar los datos es el minimo posible y el esqueleto
 * dice la verdad sobre cuanto se esta pidiendo. Reutiliza la MISMA declaracion de columnas que la
 * tabla, de modo que no puede quedarse atras cuando se anada una.
 *
 * `role="status"` + `aria-busy`: quien usa lector de pantalla oye que algo se esta cargando en
 * lugar de encontrarse una tabla vacia (que es lo que R25 prohibe confundir).
 */
export function CatalogTableSkeleton({ rows }: { readonly rows: number }) {
  return (
    <div role="status" aria-busy="true" data-testid="catalog-table-skeleton">
      <span className="sr-only">Cargando el catálogo del proveedor…</span>
      <Table>
        <TableHeader>
          <TableRow>
            {CATALOG_COLUMNS.map((column) => (
              <TableHead key={column.key} scope="col">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => index).map((index) => (
            <TableRow key={index} data-testid="catalog-row-skeleton">
              {CATALOG_COLUMNS.map((column) => (
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
