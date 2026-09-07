import { EntityImage } from '@/components/shared/entity-image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProductView } from '@/lib/modules/inventario';

import { DeleteProductDialog } from './delete-product-dialog';
import { PRODUCT_COLUMNS } from './product-columns';
import { ProductSheet } from './product-sheet';

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
/**
 * Encabezado de la columna de imagen. Constante para que ningun test dependa del literal.
 *
 * La imagen es la PRIMERA columna y se declara AQUI, en la tabla, no en la lista de columnas
 * (decision humana del 2026-09-07). Motivo: esa lista es de DATOS -cada columna devuelve una
 * cadena y el test de R6/R7 la recorre-, y una miniatura es marcado. Es exactamente el mismo
 * reparto que ya tenia la columna de acciones, que tampoco esta en la lista: imagen primero,
 * datos en medio, acciones al final.
 */
export const IMAGE_COLUMN_LABEL = 'Imagen';

/** Encabezado de la columna de acciones. Constante para que ningun test dependa del literal. */
export const ACTIONS_COLUMN_LABEL = 'Acciones';

export function ProductTable({ products }: { readonly products: readonly ProductView[] }) {
  return (
    <Table data-testid="product-table">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" data-testid="product-column-image" className="w-14 text-left">
            {IMAGE_COLUMN_LABEL}
          </TableHead>
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
          <TableHead scope="col" data-testid="product-column-actions" className="text-right">
            {ACTIONS_COLUMN_LABEL}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id} data-testid="product-row">
            {/*
              La miniatura sale de `products.image_path`. Hoy esa columna esta vacia en todas las
              filas -nada la llena todavia-, asi que lo que se ve es el marcador; ese caso NO es
              un hueco: es el estado normal por ahora.
            */}
            <TableCell className="text-left" data-testid="product-cell-image">
              <EntityImage
                path={product.imagePath}
                name={product.name}
                testId="product-image"
              />
            </TableCell>
            {PRODUCT_COLUMNS.map((column) => {
              // La alarma es de la CELDA, no de la fila: solo se tine el valor que la dispara.
              // `data-alert` acompana a la clase para que la condicion sea afirmable sin
              // depender del nombre de una utilidad de Tailwind.
              const alerted = column.alert?.(product) ?? false;
              return (
                <TableCell
                  key={column.key}
                  data-testid={`product-cell-${column.key}`}
                  data-alert={alerted ? 'true' : undefined}
                  className={`${
                    column.align === 'end' ? 'text-right tabular-nums' : 'text-left'
                  }${alerted ? ' font-semibold text-destructive' : ''}`}
                >
                  {column.value(product)}
                </TableCell>
              );
            })}
            {/*
              Las acciones van en la ultima columna y se alcanzan con el scroll de la propia
              tabla. **Siempre visibles**: nada de revelarlas con `:hover`, que en tactil no
              existe (R31).
            */}
            <TableCell className="text-right" data-testid="product-cell-actions">
              <div className="flex justify-end gap-1">
                <ProductSheet product={product} />
                <DeleteProductDialog product={product} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
