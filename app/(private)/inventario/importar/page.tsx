import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import { cn } from '@/lib/utils';

import {
  IMPORT_BACK_LABEL,
  IMPORT_BACK_LINK_TESTID,
  IMPORT_PAGE_DESCRIPTION,
  IMPORT_PAGE_TITLE,
  IMPORT_TITLE_TESTID,
  InventoryImportScreen,
} from './components';

export const metadata: Metadata = {
  title: `${IMPORT_PAGE_TITLE} · ${BRAND_LABEL}`,
};

// La confirmación escribe hasta 2.000 filas en la misma petición.
export const maxDuration = 300;

export default async function InventoryImportPage() {
  await requirePagePermission('inventario.modificar');

  // Si el catálogo de unidades no se puede leer, la importación sigue disponible; solo los
  // diálogos de alta de faltantes se quedan sin unidades que ofrecer.
  const unitsResult = await listUnitsAction();
  const units = unitsResult.status === 'success' ? unitsResult.data : [];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 data-testid={IMPORT_TITLE_TESTID} className="text-2xl font-semibold">
            {IMPORT_PAGE_TITLE}
          </h1>
          <p className="text-sm text-muted-foreground">{IMPORT_PAGE_DESCRIPTION}</p>
        </div>
        <Link
          href={INVENTORY_ROUTE}
          data-slot="button"
          data-testid={IMPORT_BACK_LINK_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), touchTarget)}
        >
          {IMPORT_BACK_LABEL}
        </Link>
      </div>
      <InventoryImportScreen units={units} />
    </div>
  );
}
