'use client';

import { useSyncExternalStore } from 'react';

import type { WhatsappConnectionView } from '@/lib/modules/integraciones';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';

import { WhatsappStatusBadge } from './whatsapp-status-badge';

export const WHATSAPP_CONNECTION_CARD_TESTID = 'whatsapp-connection-card';
export const WHATSAPP_CONNECTION_PHONE_TESTID = 'whatsapp-connection-phone';
export const WHATSAPP_CONNECTION_VERIFIED_NAME_TESTID = 'whatsapp-connection-verified-name';
export const WHATSAPP_CONNECTION_STATUS_TESTID = 'whatsapp-connection-status';
export const WHATSAPP_CONNECTION_LAST_ERROR_TESTID = 'whatsapp-connection-last-error';
export const WHATSAPP_CONNECTION_LAST_CHECKED_TESTID = 'whatsapp-connection-last-checked';

export const WHATSAPP_CONNECTION_CARD_LABELS = {
  phone: 'Número',
  verifiedName: 'Nombre verificado',
  status: 'Estado',
  lastChecked: 'Última verificación',
} as const;

const noSubscription = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
// El servidor no conoce el huso del usuario: pinta UTC y, al hidratar, React vuelve a pintar con
// el del navegador sin dar desajuste de hidratacion.
const serverTimeZone = () => 'UTC';

function formatDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
    date,
  );
}

function LocalDateTime({ iso }: { readonly iso: string }) {
  const timeZone = useSyncExternalStore(noSubscription, browserTimeZone, serverTimeZone);
  return <time dateTime={iso}>{formatDateTime(iso, timeZone)}</time>;
}

export type WhatsappConnectionCardProps = {
  readonly connection: WhatsappConnectionView;
};

export function WhatsappConnectionCard({ connection }: WhatsappConnectionCardProps) {
  const showLastError = connection.status === 'ERROR' && connection.lastError !== null;

  return (
    <section
      aria-labelledby="whatsapp-connection-card-title"
      data-testid={WHATSAPP_CONNECTION_CARD_TESTID}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="whatsapp-connection-card-title" className="text-base font-medium break-words">
        {connection.displayName}
      </h2>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{WHATSAPP_CONNECTION_CARD_LABELS.phone}</dt>
        <dd data-testid={WHATSAPP_CONNECTION_PHONE_TESTID}>
          {connection.displayPhoneNumber ?? EMPTY_MARK}
        </dd>

        <dt className="text-muted-foreground">{WHATSAPP_CONNECTION_CARD_LABELS.verifiedName}</dt>
        <dd data-testid={WHATSAPP_CONNECTION_VERIFIED_NAME_TESTID} className="break-words">
          {connection.verifiedName ?? EMPTY_MARK}
        </dd>

        <dt className="text-muted-foreground">{WHATSAPP_CONNECTION_CARD_LABELS.status}</dt>
        <dd
          data-testid={WHATSAPP_CONNECTION_STATUS_TESTID}
          data-status={connection.status}
          className="flex flex-wrap items-center gap-2"
        >
          <WhatsappStatusBadge status={connection.status} />
          {showLastError ? (
            <span
              data-testid={WHATSAPP_CONNECTION_LAST_ERROR_TESTID}
              className="text-destructive break-words"
            >
              {connection.lastError}
            </span>
          ) : null}
        </dd>

        <dt className="text-muted-foreground">{WHATSAPP_CONNECTION_CARD_LABELS.lastChecked}</dt>
        <dd data-testid={WHATSAPP_CONNECTION_LAST_CHECKED_TESTID}>
          {connection.lastCheckedAt === null ? (
            EMPTY_MARK
          ) : (
            <LocalDateTime iso={connection.lastCheckedAt} />
          )}
        </dd>
      </dl>
    </section>
  );
}
