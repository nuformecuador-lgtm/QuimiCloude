import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL, WHATSAPP_INTEGRATION_LABEL } from '@/lib/shared/navigation/private-nav';

import { IntegrationPlaceholder } from '../components';

export const metadata: Metadata = {
  title: `${WHATSAPP_INTEGRATION_LABEL} · ${BRAND_LABEL}`,
};

export default async function WhatsappIntegrationPage() {
  await requirePagePermission('integraciones.modificar');

  return <IntegrationPlaceholder title={WHATSAPP_INTEGRATION_LABEL} />;
}
