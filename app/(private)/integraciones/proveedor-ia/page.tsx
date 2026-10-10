import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { AI_PROVIDER_INTEGRATION_LABEL, BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import { IntegrationPlaceholder } from '../components';

export const metadata: Metadata = {
  title: `${AI_PROVIDER_INTEGRATION_LABEL} · ${BRAND_LABEL}`,
};

export default async function AiProviderIntegrationPage() {
  await requirePagePermission('integraciones.modificar');

  return <IntegrationPlaceholder title={AI_PROVIDER_INTEGRATION_LABEL} />;
}
