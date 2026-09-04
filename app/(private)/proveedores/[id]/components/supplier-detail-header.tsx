import type { SupplierView } from '@/lib/modules/proveedores';

import { EMPTY_CELL } from './catalog-columns';

/**
 * Datos de contacto del proveedor en su pagina de detalle (R19, `design.md > 6.1`).
 *
 * **Sin `'use client'`**: no tiene estado ni manejadores. Recibe el proveedor por props desde la
 * pagina, que es quien llama a `getSupplierAction` (R46): este componente no consulta nada, no
 * importa `lib/composition` ni el cliente de base de datos, y no decide ningun permiso (R7).
 *
 * **Solo nombre, telefono y correo** (R19). `createdBy`/`updatedBy` NO se pintan (R12): son
 * identificadores y resolverlos a nombres exigiria consumir el contrato de `identity`, que esta
 * ficha no abre. El `id` tampoco se pinta: ya esta en la URL y no dice nada al usuario.
 *
 * Cada dato tiene su `data-testid` estable (R47), de modo que el test lo localiza sin depender
 * del texto visible de la etiqueta.
 */
export function SupplierDetailHeader({ supplier }: { readonly supplier: SupplierView }) {
  return (
    <header className="flex flex-col gap-2" data-testid="supplier-detail">
      <h1 className="text-2xl font-semibold" data-testid="supplier-detail-name">
        {supplier.name}
      </h1>
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
