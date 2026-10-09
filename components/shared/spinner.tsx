import { Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';

type SpinnerProps = {
  /** `inherit` deja que el tamaño lo ponga el contenedor (p. ej. el `svg` de un `Button`). */
  readonly size?: 'sm' | 'inherit';
  readonly className?: string;
};

export function Spinner({ size = 'sm', className }: SpinnerProps) {
  return (
    <Loader2Icon
      className={cn(size === 'inherit' ? undefined : 'size-4', 'animate-spin', className)}
      aria-hidden
    />
  );
}
