import { cn } from '@/lib/utils';

export const APPROXIMATE_LABEL = 'aprox.';
const APPROXIMATE_TITLE = 'Conversión aproximada: 1 ml ≈ 1 g';
const NOT_CONVERTIBLE_LABEL = 'La unidad del pedido no es convertible a la del insumo.';

type MarkProps = {
  readonly testId: string;
  readonly className?: string;
};

/** Texto visible y no tooltip: en pantallas tactiles un tooltip no llega a verse. */
export function ApproximateMark({ testId, className }: MarkProps) {
  return (
    <span className={cn('text-muted-foreground', className)} title={APPROXIMATE_TITLE} data-testid={testId}>
      {APPROXIMATE_LABEL}
    </span>
  );
}

export function NotConvertibleNotice({ testId, className }: MarkProps) {
  return (
    <span className={cn('text-destructive', className)} data-testid={testId}>
      {NOT_CONVERTIBLE_LABEL}
    </span>
  );
}
