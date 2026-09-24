import { SupplierSheet } from '@/components/shared/supplier';
import type { SupplierView } from '@/lib/modules/proveedores';

import { EMPTY_CELL } from './catalog-columns';
import { DeleteSupplierDialog } from './delete-supplier-dialog';

/**
 * Datos de contacto del proveedor en su pagina de detalle, con sus controles de edicion y baja.
 * Sin `'use client'`: recibe el proveedor por props y no consulta nada por su cuenta.
 */
export function SupplierDetailHeader({ supplier }: { readonly supplier: SupplierView }) {
  return (
    <header className="flex flex-col gap-2" data-testid="supplier-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* `min-w-0` deja encoger al nombre por debajo de su ancho intrinseco dentro del flex. */}
        <h1
          className="min-w-0 flex-1 break-words text-2xl font-semibold"
          data-testid="supplier-detail-name"
        >
          {supplier.name}
        </h1>
        <div className="flex items-center gap-1">
          <SupplierSheet supplier={supplier} />
          <DeleteSupplierDialog supplier={supplier} />
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-muted-foreground">
        <div className="flex gap-2">
          <dt>Teléfono</dt>
          <dd data-testid="supplier-detail-phone">{supplier.phone ?? EMPTY_CELL}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Correo electrónico</dt>
          <dd data-testid="supplier-detail-email">{supplier.email ?? EMPTY_CELL}</dd>
        </div>
      </dl>
    </header>
  );
}
