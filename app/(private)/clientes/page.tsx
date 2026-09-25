import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL, CUSTOMERS_LABEL } from '@/lib/shared/navigation/private-nav';

export const metadata: Metadata = {
  title: `${CUSTOMERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Version minima: solo el corte por permiso y el titulo, para que las guardias de rutas
 * privadas y de permisos por pantalla queden en verde antes de que llegue el resto de la lista.
 */
export default async function ClientesPage() {
  await requirePagePermission('clientes.consultar');

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="clientes-title" className="text-2xl font-semibold">
        {CUSTOMERS_LABEL}
      </h1>
    </div>
  );
}
