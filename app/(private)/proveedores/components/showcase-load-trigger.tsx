'use client';

import { useInView } from 'react-intersection-observer';

type ShowcaseLoadTriggerProps = {
  readonly onVisible: () => void;
  /** Deja de observar mientras la lista no quiere disparar otra carga (vuelo en curso o aviso de fallo). */
  readonly disabled?: boolean;
};

/**
 * Centinela de carga perezosa. Único archivo de producción que importa
 * `react-intersection-observer`: sustituirla es reescribir solo este archivo.
 */
export function ShowcaseLoadTrigger({ onVisible, disabled = false }: ShowcaseLoadTriggerProps) {
  const { ref } = useInView({
    skip: disabled,
    onChange: (inView) => {
      if (inView) onVisible();
    },
  });

  return <div ref={ref} data-testid="showcase-load-trigger" aria-hidden="true" className="h-px w-full" />;
}
