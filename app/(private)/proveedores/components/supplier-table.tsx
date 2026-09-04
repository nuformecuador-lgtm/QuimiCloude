import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SupplierView } from '@/lib/modules/proveedores';
import { supplierDetailRoute } from '@/lib/shared/routes';

import { SUPPLIER_COLUMNS } from './supplier-columns';

/**
 * Tabla de la lista de proveedores (R13, R14, R15, `design.md > 5.3`).
 *
 * **Sin `'use client'`**: no tiene estado ni manejadores propios. Recibe los proveedores por
 * props desde `SupplierListSection`, que es quien llama a la operacion de consulta (R46). Cada
 * accion de fila es un componente independiente con su propio disparador, asi que la tabla no
 * coordina nada.
 *
 * **El enlace al detalle sale del helper** `supplierDetailRoute(id)` (R3): ni aqui ni en ningun
 * otro archivo de producto se escribe la URL del detalle como literal. Va en la celda de nombre
 * —el propio nombre es lo que se pulsa para entrar— y es **siempre visible**: nada de revelar
 * una accion con `:hover`, que en tactil no existe (R48). Su area tactil llega a 44x44 px con
 * `TOUCH_TARGET`.
 *
 * **R13 lo cumple el primitivo, no una clase escrita aqui**: `components/ui/table.tsx` envuelve
 * el `<table>` en un `div[data-slot=table-container]` con `overflow-x-auto`. El desbordamiento
 * horizontal lo absorbe ese envoltorio y **ningun ancestro** de la pantalla declara scroll
 * horizontal ni `100vh`, de modo que el documento no se desplaza en viewport angosto. No se
 * edita el primitivo (R44) ni se anade columna pegajosa: `position: sticky` horizontal se
 * comporta distinto en WebKit.
 *
 * **La columna final de acciones de fila —editar y dar de baja— la anaden T8 y T9**, que son las
 * tasks que construyen el panel lateral y el dialogo de confirmacion. Hoy la unica accion de
 * fila que existe es la navegacion al detalle, y se declara donde va a quedarse; no se pinta una
 * columna «Acciones» vacia que prometa controles que todavia no hay.
 */

/** Clase de area tactil minima de R48 (44x44 px). Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

export function SupplierTable({ suppliers }: { readonly suppliers: readonly SupplierView[] }) {
  return (
    <Table data-testid="supplier-table">
      <TableHeader>
        <TableRow>
          {SUPPLIER_COLUMNS.map((column) => (
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
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id} data-testid="supplier-row">
            {SUPPLIER_COLUMNS.map((column) => (
              <TableCell
                key={column.key}
                data-testid={`supplier-cell-${column.key}`}
                className={column.align === 'end' ? 'text-right tabular-nums' : 'text-left'}
              >
                {column.key === 'name' ? (
                  <Link
                    href={supplierDetailRoute(supplier.id)}
                    className={`${TOUCH_TARGET} inline-flex items-center justify-start rounded-lg font-medium underline-offset-4 hover:underline`}
                    aria-label={`Ver el detalle de ${supplier.name}`}
                    data-testid="supplier-detail-link"
                  >
                    {column.value(supplier)}
                  </Link>
                ) : (
                  column.value(supplier)
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
