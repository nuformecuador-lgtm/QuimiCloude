import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SupplierSheet } from '@/components/shared/supplier';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL, SUPPLIERS_LABEL } from '@/lib/shared/navigation/private-nav';

import { parseSupplierListParams, SupplierListSection, SupplierTableSkeleton } from './components';

export const metadata: Metadata = {
  title: `${SUPPLIERS_LABEL} · ${BRAND_LABEL}`,
};

type SupplierPageSearchParams = Record<string, string | string[] | undefined>;

// El contenedor es un div: el landmark principal ya lo pone el layout privado y debe ser único.
export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<SupplierPageSearchParams>;
}) {
  await requirePagePermission('proveedores.consultar');

  const params = parseSupplierListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="proveedores-title" className="text-2xl font-semibold">
          {SUPPLIERS_LABEL}
        </h1>
        <SupplierSheet />
      </div>
      {/* Sin key: remontar el límite en cada cambio de consulta borraría el foco de la búsqueda. */}
      <Suspense fallback={<SupplierTableSkeleton rows={params.pageSize} />}>
        <SupplierListSection params={params} />
      </Suspense>
    </div>
  );
}
