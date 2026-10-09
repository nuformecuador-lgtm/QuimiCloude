'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WhatsappWebhookUrl } from '@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions';

export const WHATSAPP_WEBHOOK_PANEL_TESTID = 'whatsapp-webhook-panel';
export const WHATSAPP_WEBHOOK_URL_TESTID = 'whatsapp-webhook-url';
export const WHATSAPP_WEBHOOK_COPY_TESTID = 'whatsapp-webhook-copy';
export const WHATSAPP_WEBHOOK_COPIED_TESTID = 'whatsapp-webhook-copied';
export const WHATSAPP_WEBHOOK_INCOMPLETE_TESTID = 'whatsapp-webhook-incomplete';
export const WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID = 'whatsapp-verify-token-notice';
export const WHATSAPP_VERIFY_TOKEN_TESTID = 'whatsapp-verify-token';
export const WHATSAPP_VERIFY_TOKEN_COPY_TESTID = 'whatsapp-verify-token-copy';
export const WHATSAPP_VERIFY_TOKEN_COPIED_TESTID = 'whatsapp-verify-token-copied';

export const WHATSAPP_WEBHOOK_TEXTS = {
  urlLabel: 'URL del webhook',
  tokenLabel: 'Verify token',
  copy: 'Copiar',
  copyUrlAccessible: 'Copiar la URL del webhook',
  copyTokenAccessible: 'Copiar el verify token',
  copied: 'Copiada',
  incomplete: 'Falta configurar la URL pública de la aplicación (APP_BASE_URL).',
  tokenOnce: 'Cópialo ahora: no se volverá a mostrar.',
} as const;

export type RevealedVerifyToken = {
  readonly verifyToken: string;
  readonly webhook: WhatsappWebhookUrl;
};

type VerifyTokenContextValue = {
  readonly revealed: RevealedVerifyToken | null;
  readonly reveal: (value: RevealedVerifyToken) => void;
};

const VerifyTokenContext = createContext<VerifyTokenContextValue | null>(null);

/**
 * Guarda el verify token recien creado o regenerado solo en memoria del navegador. Va por encima
 * del formulario y del panel porque, al crear, el refresco del servidor cambia el formulario por
 * la tarjeta y el token tiene que sobrevivir a ese cambio.
 */
export function WhatsappVerifyTokenProvider({ children }: { readonly children: ReactNode }) {
  const [revealed, setRevealed] = useState<RevealedVerifyToken | null>(null);
  const value = useMemo(() => ({ revealed, reveal: setRevealed }), [revealed]);
  return <VerifyTokenContext.Provider value={value}>{children}</VerifyTokenContext.Provider>;
}

const noReveal = () => {};

export function useRevealWhatsappVerifyToken(): (value: RevealedVerifyToken) => void {
  return useContext(VerifyTokenContext)?.reveal ?? noReveal;
}

function useRevealedWhatsappVerifyToken(): RevealedVerifyToken | null {
  return useContext(VerifyTokenContext)?.revealed ?? null;
}

type CopyFieldProps = {
  readonly label: string;
  readonly value: string;
  readonly copyAccessibleLabel: string;
  readonly fieldTestId: string;
  readonly copyTestId: string;
  readonly copiedTestId: string;
  readonly describedBy?: string;
};

function CopyField({
  label,
  value,
  copyAccessibleLabel,
  fieldTestId,
  copyTestId,
  copiedTestId,
  describedBy,
}: CopyFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Sin portapapeles (contexto inseguro o permiso denegado) el texto queda seleccionado
      // para copiarlo a mano.
      setCopied(false);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          aria-describedby={describedBy}
          className="min-h-11 font-mono text-base md:text-base"
          data-testid={fieldTestId}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          touch
          aria-label={copyAccessibleLabel}
          data-testid={copyTestId}
          onClick={() => void copy()}
        >
          {WHATSAPP_WEBHOOK_TEXTS.copy}
        </Button>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground" data-testid={copiedTestId}>
        {copied ? WHATSAPP_WEBHOOK_TEXTS.copied : ''}
      </p>
    </div>
  );
}

export type WhatsappWebhookPanelProps = {
  readonly webhook: WhatsappWebhookUrl;
};

export function WhatsappWebhookPanel({ webhook }: WhatsappWebhookPanelProps) {
  const revealed = useRevealedWhatsappVerifyToken();
  const incompleteId = useId();
  const tokenOnceId = useId();

  return (
    <section
      data-testid={WHATSAPP_WEBHOOK_PANEL_TESTID}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <CopyField
        label={WHATSAPP_WEBHOOK_TEXTS.urlLabel}
        value={webhook.url}
        copyAccessibleLabel={WHATSAPP_WEBHOOK_TEXTS.copyUrlAccessible}
        fieldTestId={WHATSAPP_WEBHOOK_URL_TESTID}
        copyTestId={WHATSAPP_WEBHOOK_COPY_TESTID}
        copiedTestId={WHATSAPP_WEBHOOK_COPIED_TESTID}
        describedBy={webhook.complete ? undefined : incompleteId}
      />
      {webhook.complete ? null : (
        <p
          id={incompleteId}
          role="status"
          className="text-sm text-destructive"
          data-testid={WHATSAPP_WEBHOOK_INCOMPLETE_TESTID}
        >
          {WHATSAPP_WEBHOOK_TEXTS.incomplete}
        </p>
      )}
      {revealed === null ? null : (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-amber-500/50 p-3"
          data-testid={WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID}
        >
          <p id={tokenOnceId} className="text-sm font-medium">
            {WHATSAPP_WEBHOOK_TEXTS.tokenOnce}
          </p>
          <CopyField
            label={WHATSAPP_WEBHOOK_TEXTS.tokenLabel}
            value={revealed.verifyToken}
            copyAccessibleLabel={WHATSAPP_WEBHOOK_TEXTS.copyTokenAccessible}
            fieldTestId={WHATSAPP_VERIFY_TOKEN_TESTID}
            copyTestId={WHATSAPP_VERIFY_TOKEN_COPY_TESTID}
            copiedTestId={WHATSAPP_VERIFY_TOKEN_COPIED_TESTID}
            describedBy={tokenOnceId}
          />
        </div>
      )}
    </section>
  );
}
