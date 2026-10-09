import type { Metadata } from 'next';

import { ErrorAlert } from '@/components/shared/error-alert';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { getWhatsappConnectionAction } from '@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions';
import { BRAND_LABEL, WHATSAPP_INTEGRATION_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  WhatsappConnectionActions,
  WhatsappConnectionCard,
  WhatsappConnectionForm,
  WhatsappIntegrationTabs,
  WhatsappSetupGuide,
  WhatsappWebhookPanel,
} from './components';

export const metadata: Metadata = {
  title: `${WHATSAPP_INTEGRATION_LABEL} · ${BRAND_LABEL}`,
};

export default async function WhatsappIntegrationPage() {
  await requirePagePermission('integraciones.modificar');

  const result = await getWhatsappConnectionAction();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="integration-title" className="text-2xl font-semibold">
        {WHATSAPP_INTEGRATION_LABEL}
      </h1>
      <WhatsappIntegrationTabs>
        {result.status === 'error' ? (
          <ErrorAlert
            error={result}
            className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
            testId="whatsapp-page-error"
            withDataCode
          />
        ) : result.data === null || result.webhook === null ? (
          <>
            <WhatsappSetupGuide />
            <WhatsappConnectionForm mode="create" />
          </>
        ) : (
          <>
            <WhatsappConnectionCard connection={result.data} />
            <WhatsappWebhookPanel webhook={result.webhook} />
            <WhatsappConnectionActions connection={result.data} />
          </>
        )}
      </WhatsappIntegrationTabs>
    </div>
  );
}
