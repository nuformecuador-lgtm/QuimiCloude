import type { ReactNode } from 'react';

type SupplierListEmptyProps = {
  /** Accion de crear el primer proveedor, pasada como slot para no importar aqui el panel lateral. */
  readonly children?: ReactNode;
};

/** Estado vacio de la lista de proveedores: identificable por su propio data-testid. */
export function SupplierListEmpty({ children }: SupplierListEmptyProps) {
  return (
    <div
      data-testid="supplier-list-empty"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground">Todavía no hay proveedores dados de alta.</p>
      {children}
    </div>
  );
}
