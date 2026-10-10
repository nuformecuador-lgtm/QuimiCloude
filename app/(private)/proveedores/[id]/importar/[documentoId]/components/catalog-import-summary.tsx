'use client';

import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import type { CatalogImportSummary as CatalogImportSummaryData } from '@/lib/modules/documentos';
import { supplierDetailRoute } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

type CatalogImportSummaryProps = {
  readonly supplierId: string;
  readonly summary: CatalogImportSummaryData;
};

/**
 * Resultado de una confirmacion que termino bien: cuantas lineas se crearon, se actualizaron o
 * quedaron sin cambios, cuantas presentaciones nacieron, y la vuelta al catalogo ya actualizado.
 *
 * El destino sale de `supplierDetailRoute`, nunca de un literal: la ruta de vuelta no puede
 * desincronizarse de la que compone el resto de la pantalla de proveedores.
 */
export function CatalogImportSummary({ supplierId, summary }: CatalogImportSummaryProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-start gap-4 rounded-lg border p-4"
      data-testid="catalog-import-summary"
    >
      <p className="text-sm font-medium">La importación se guardó correctamente.</p>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Creadas</dt>
          <dd data-testid="catalog-import-summary-created">{summary.created}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Actualizadas</dt>
          <dd data-testid="catalog-import-summary-updated">{summary.updated}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Sin cambios</dt>
          <dd data-testid="catalog-import-summary-unchanged">{summary.unchanged}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Presentaciones creadas</dt>
          <dd data-testid="catalog-import-summary-presentations-created">
            {summary.presentationsCreated}
          </dd>
        </div>
      </dl>

      <Link
        href={supplierDetailRoute(supplierId)}
        data-slot="button"
        className={cn(buttonVariants({ variant: 'outline', touch: true }))}
        data-testid="catalog-import-summary-back-link"
      >
        Volver al detalle del proveedor
      </Link>
    </div>
  );
}
