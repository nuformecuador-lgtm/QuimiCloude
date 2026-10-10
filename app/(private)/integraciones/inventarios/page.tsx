import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL, INVENTORY_INTEGRATION_LABEL } from '@/lib/shared/navigation/private-nav';

import { IntegrationPlaceholder } from '../components';

export const metadata: Metadata = {
  title: `${INVENTORY_INTEGRATION_LABEL} · ${BRAND_LABEL}`,
};

export default async function InventoryIntegrationPage() {
  await requirePagePermission('integraciones.modificar');

  return <IntegrationPlaceholder title={INVENTORY_INTEGRATION_LABEL} />;
}
