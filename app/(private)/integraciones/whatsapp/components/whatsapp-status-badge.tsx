import { Badge } from '@/components/ui/badge';
import type { WhatsappConnectionStatus } from '@/lib/modules/integraciones';

export const WHATSAPP_STATUS_BADGE_TESTID = 'whatsapp-status-badge';

export const WHATSAPP_STATUS_LABELS: Readonly<Record<WhatsappConnectionStatus, string>> = {
  PENDING: 'Pendiente',
  ACTIVE: 'Activa',
  ERROR: 'Error',
  DISABLED: 'Deshabilitada',
};

const STATUS_VARIANT: Readonly<
  Record<WhatsappConnectionStatus, 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  PENDING: 'secondary',
  ACTIVE: 'default',
  ERROR: 'destructive',
  DISABLED: 'outline',
};

export type WhatsappStatusBadgeProps = {
  readonly status: WhatsappConnectionStatus;
};

export function WhatsappStatusBadge({ status }: WhatsappStatusBadgeProps) {
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      data-testid={WHATSAPP_STATUS_BADGE_TESTID}
      data-status={status}
    >
      {WHATSAPP_STATUS_LABELS[status]}
    </Badge>
  );
}
