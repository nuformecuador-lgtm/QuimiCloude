'use client';

import { useEffect, useState, type RefObject } from 'react';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import { cn } from '@/lib/utils';

/**
 * Flechas de desplazamiento horizontal de la tabla (`data-table.tsx`, T11).
 *
 * Aparecen SOLO cuando la tabla supera el ancho de su contenedor (`scrollWidth >
 * clientWidth` del `div[data-slot="table-container"]` de `components/ui/table.tsx`, que es
 * donde vive el `overflow-x-auto` segun R28): sin desbordamiento no se pinta nada. Cada
 * flecha se deshabilita cuando no hay mas recorrido en su direccion (`scrollLeft` en el
 * borde izquierdo / `scrollLeft + clientWidth` en el derecho, con 1 px de tolerancia por
 * subpixel).
 *
 * Son un overlay que NO sale del contenedor y sigue a la pantalla: cada flecha es
 * `sticky` con `top: 50vh` dentro de un overlay `absolute inset-0` (la caja exacta del
 * envoltorio). Mientras la tabla esta en vista, las flechas se quedan centradas a mitad
 * de la pantalla; el propio `sticky` las retiene dentro de la caja al llegar a los bordes
 * superior e inferior. No anaden scroll propio ni tocan el layout (R28): el overlay es
 * `pointer-events-none` salvo los botones. No consultan ni navegan (R2, R30): solo mueven
 * el `scrollLeft` del contenedor que ya existe.
 */

/** Etiquetas internas cuando `texts.scrollLeft/scrollRight` no llegan (opcionales, `data-table-types.ts`). */
export const SCROLL_LEFT_FALLBACK = 'Desplazar la tabla a la izquierda';
export const SCROLL_RIGHT_FALLBACK = 'Desplazar la tabla a la derecha';

/** Cuanto avanza cada pulsacion: tres cuartos del ancho visible, con un minimo para tablas angostas. */
const SCROLL_FRACTION = 0.75;
const SCROLL_MIN_PX = 96;

function scrollBehavior(): ScrollBehavior {
  if (typeof window.matchMedia !== 'function') return 'smooth';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export type DataTableScrollNavProps = {
  /**
   * Ref al envoltorio `relative` que contiene al `div[data-slot="table-container"]` con el
   * scroll. Se resuelve por selector y no por prop del `Table` de shadcn para no abrir la
   * primitiva (R33): las primitivas no conocen la feature.
   */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  /**
   * Clave que cambia cuando el contenido que puede desbordar cambia (columnas, filas,
   * estado): re-evalua el desbordamiento aunque ningun `resize` ni `scroll` haya saltado.
   */
  readonly contentKey: string;
  readonly scrollLeftLabel: string;
  readonly scrollRightLabel: string;
};

type ScrollAvailability = {
  readonly canScroll: boolean;
  readonly canGoLeft: boolean;
  readonly canGoRight: boolean;
};

function readAvailability(element: HTMLElement): ScrollAvailability {
  // 1 px de tolerancia: `scrollLeft`/`scrollWidth` pueden llegar fraccionarios por subpixel.
  const canScroll = element.scrollWidth > element.clientWidth + 1;
  return {
    canScroll,
    canGoLeft: canScroll && element.scrollLeft > 1,
    canGoRight: canScroll && element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
  };
}

function resolveScrollElement(wrapper: HTMLDivElement | null): HTMLElement | null {
  if (wrapper === null) return null;
  const element = wrapper.querySelector('[data-slot="table-container"]');
  return element instanceof HTMLElement ? element : null;
}

export function DataTableScrollNav({
  containerRef,
  contentKey,
  scrollLeftLabel,
  scrollRightLabel,
}: DataTableScrollNavProps) {
  const [availability, setAvailability] = useState<ScrollAvailability>({
    canScroll: false,
    canGoLeft: false,
    canGoRight: false,
  });

  useEffect(() => {
    const element = resolveScrollElement(containerRef.current);
    if (element === null) return;

    const update = () => setAvailability(readAvailability(element));
    update();

    element.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    const wrapper = containerRef.current;
    if (wrapper !== null) observer?.observe(wrapper);

    return () => {
      element.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
    // `contentKey` re-evalua el desbordamiento cuando cambia lo pintado (carga de filas,
    // cambio de columnas) sin esperar a un `resize`.
  }, [containerRef, contentKey]);

  function scrollBy(direction: 1 | -1) {
    const element = resolveScrollElement(containerRef.current);
    if (element === null) return;
    const delta = direction * Math.max(element.clientWidth * SCROLL_FRACTION, SCROLL_MIN_PX);
    if (typeof element.scrollBy === 'function') {
      element.scrollBy({ left: delta, behavior: scrollBehavior() });
    } else {
      element.scrollLeft += delta;
    }
  }

  if (!availability.canScroll) return null;

  /*
   * Sin efecto de pulsacion: si la flecha se mueve al presionar y el cursor queda fuera al
   * soltar, el clic se pierde (solo funcionaba presionando el centro, sobre el icono).
   *
   * Las neutralizaciones van por `twMerge` (en `cn`), porque un `active:` simple NO sirve:
   * las clases de pulsacion del `Button` llevan el stack apilado
   * (`active:not-aria-[haspopup]:...`) y `twMerge` solo resuelve conflictos con el mismo stack:
   * - `active:not-aria-[haspopup]:-translate-y-1/2`: el centrado se conserva tambien
   *   presionada, aunque una variante traiga su propio `translate-y` al pulsar.
   * - `active:not-aria-[haspopup]:scale-100`: la variante `outline` encoge al presionar; la
   *   flecha no.
   * - `transition-colors`: expulsa el `transition-all` del base; el fundido del `hover` se
   *   conserva.
   */
  const arrowClass = cn(
    'pointer-events-auto sticky top-[50vh] z-20 -translate-y-1/2 rounded-full border bg-background/95 shadow-md backdrop-blur transition-colors active:not-aria-[haspopup]:-translate-y-1/2 active:not-aria-[haspopup]:scale-100',
    touchTarget,
  );

  /*
   * `pointer-events-none` en el icono: el clic (y el :active) pertenecen al contenedor del
   * boton, nunca al `svg`. Sin esto, presionar justo sobre el icono podia comportarse
   * distinto que presionar el relleno del boton.
   */
  return (
    <div
      data-testid="data-table-scroll-nav"
      className="pointer-events-none absolute inset-0 z-20 flex items-start justify-between p-2"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={arrowClass}
        aria-label={scrollLeftLabel}
        data-testid="data-table-scroll-left"
        disabled={!availability.canGoLeft}
        onClick={() => scrollBy(-1)}
      >
        <ChevronLeftIcon aria-hidden="true" className="pointer-events-none" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={arrowClass}
        aria-label={scrollRightLabel}
        data-testid="data-table-scroll-right"
        disabled={!availability.canGoRight}
        onClick={() => scrollBy(1)}
      >
        <ChevronRightIcon aria-hidden="true" className="pointer-events-none" />
      </Button>
    </div>
  );
}
