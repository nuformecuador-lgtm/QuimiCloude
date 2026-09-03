import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProductView } from '@/lib/modules/inventario';

import { PRODUCT_COLUMNS } from './product-columns';

/**
 * Tabla del catalogo (R6-R9, `design.md > 4.3`, `> 7`).
 *
 * **Sin `'use client'`**: no tiene estado ni manejadores. Recibe los productos por props desde
 * `ProductListSection`, que es quien llama a la operacion de consulta (R30). Cada accion de fila
 * es un componente de cliente independiente con su propio disparador, asi que la tabla no
 * necesita coordinar nada.
 *
 * **R9 lo cumple el primitivo, no una clase escrita aqui**: `components/ui/table.tsx` envuelve
 * el `<table>` en un `div[data-slot=table-container]` con `overflow-x-auto`. El desbordamiento
 * horizontal lo absorbe ese envoltorio y **ningun ancestro** de la pantalla declara scroll
 * horizontal ni `100vh`, de modo que el documento no se desplaza en viewport angosto. No se
 * edita el primitivo (R29) ni se anade columna pegajosa: `position: sticky` horizontal se
 * comporta distinto en WebKit y las acciones se alcanzan con el scroll de la propia tabla.
 */
export function ProductTable({ products }: { readonly products: readonly ProductView[] }) {
  return (
    <Table data-testid="product-table">
      <TableHeader>
        <TableRow>
          {PRODUCT_COLUMNS.map((column) => (
            <TableHead
              key={column.key}
              data-testid={column.testId}
              className={column.align === 'end' ? 'text-right' : 'text-left'}
              scope="col"
            >
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id} data-testid="product-row">
            {PRODUCT_COLUMNS.map((column) => (
              <TableCell
                key={column.key}
                data-testid={`product-cell-${column.key}`}
                className={column.align === 'end' ? 'text-right tabular-nums' : 'text-left'}
              >
                {column.value(product)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
