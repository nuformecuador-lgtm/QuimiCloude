'use client';

import type { ReactNode } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { WhatsappVerifyTokenProvider } from './whatsapp-webhook-panel';

export const WHATSAPP_TABS_TESTID = 'whatsapp-integration-tabs';
export const WHATSAPP_TAB_CONNECTION_TESTID = 'whatsapp-tab-connection';
export const WHATSAPP_TAB_TEMPLATES_TESTID = 'whatsapp-tab-templates';
export const WHATSAPP_CONNECTION_PANEL_TESTID = 'whatsapp-connection-panel';

export const WHATSAPP_TABS_TEXTS = {
  connection: 'Conexión',
  templates: 'Plantillas',
  comingSoon: 'Disponible próximamente',
} as const;

const CONNECTION_TAB = 'conexion';
const TEMPLATES_TAB = 'plantillas';

const TRIGGER_CLASS = 'h-auto min-h-11 flex-col gap-0 px-3 py-1';

export type WhatsappIntegrationTabsProps = {
  /** Contenido de la pestaña «Conexión», pintado por la pagina. */
  readonly children: ReactNode;
};

export function WhatsappIntegrationTabs({ children }: WhatsappIntegrationTabsProps) {
  return (
    <WhatsappVerifyTokenProvider>
      <Tabs defaultValue={CONNECTION_TAB} data-testid={WHATSAPP_TABS_TESTID}>
        <TabsList className="h-auto group-data-horizontal/tabs:h-auto">
          <TabsTrigger
            value={CONNECTION_TAB}
            className={TRIGGER_CLASS}
            data-testid={WHATSAPP_TAB_CONNECTION_TESTID}
          >
            {WHATSAPP_TABS_TEXTS.connection}
          </TabsTrigger>
          <TabsTrigger
            value={TEMPLATES_TAB}
            disabled
            className={TRIGGER_CLASS}
            data-testid={WHATSAPP_TAB_TEMPLATES_TESTID}
          >
            <span>{WHATSAPP_TABS_TEXTS.templates}</span>
            <span className="text-xs font-normal">{WHATSAPP_TABS_TEXTS.comingSoon}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value={CONNECTION_TAB}
          className="flex flex-col gap-4 pt-2"
          data-testid={WHATSAPP_CONNECTION_PANEL_TESTID}
        >
          {children}
        </TabsContent>
      </Tabs>
    </WhatsappVerifyTokenProvider>
  );
}
