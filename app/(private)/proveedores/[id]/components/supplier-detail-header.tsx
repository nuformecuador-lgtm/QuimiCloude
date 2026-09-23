import { SupplierSheet } from '@/components/shared/supplier';
import type { SupplierView } from '@/lib/modules/proveedores';

import { EMPTY_CELL } from './catalog-columns';
import { DeleteSupplierDialog } from './delete-supplier-dialog';

/**
 * Datos de contacto del proveedor en su pagina de detalle, con sus controles de edicion y baja.
 *
 * **Sin `'use client'`**: no tiene estado ni manejadores propios. Recibe el proveedor por props
 * desde la pagina, que es quien llama a `getSupplierAction`: este componente no consulta nada, no
 * importa `lib/composition` ni el cliente de base de datos, y no decide ningun permiso. Los dos
 * controles montados si son de cliente, pero eso lo declaran ellos mismos.
 *
 * Solo nombre, telefono y correo. `createdBy`/`updatedBy` no se pintan: son identificadores y
 * resolverlos a nombres exigiria consumir el contrato de `identity`. El `id` tampoco se pinta: ya
 * esta en la URL y no dice nada al usuario.
 *
 * Cada dato tiene su `data-testid` estable, de modo que el test lo localiza sin depender del texto
 * visible de la etiqueta.
 */
export function SupplierDetailHeader({ supplier }: { readonly supplier: SupplierView }) {
  return (
    <header className="flex flex-col gap-2" data-testid="supplier-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold" data-testid="supplier-detail-name">
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
