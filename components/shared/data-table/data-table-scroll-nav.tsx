'use client';

import { useEffect, useState, type RefObject } from 'react';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

/** Objetivo tactil minimo (44 px), mismo criterio que `data-table-header-menu.tsx` (R27). */
const TOUCH_TARGET = 'min-h-11 min-w-11';

/** Cuanto avanza cada pulsacion: tres cuartos del ancho visible, con un minimo para tablas angostas. */
const SCROLL_FRACTION = 0.75;
const SCROLL_MIN_PX = 96;

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
      element.scrollBy({ left: delta, behavior: 'smooth' });
    } else {
      element.scrollLeft += delta;
    }
  }

  if (!availability.canScroll) return null;

  /*
   * Sin animacion de rebote al presionar: el `Button` trae
   * `active:not-aria-[haspopup]:translate-y-px` (efecto press con `transition-all`) y esa
   * clase pisa el `-translate-y-1/2` del centrado: al presionar, la flecha caia media
   * altura y volvia al soltar -y si el cursor quedaba fuera del boton al soltar, el clic
   * se perdia (por eso solo funcionaba presionando el centro, sobre el icono)-.
   *
   * Dos neutralizaciones, las dos por `twMerge` (en `cn`), porque un `active:` simple NO
   * sirve: la variante del base es APILADA (`active:not-aria-[haspopup]:...`) y `twMerge`
   * solo resuelve conflictos con el mismo stack de modificadores:
   * - `active:not-aria-[haspopup]:-translate-y-1/2`: mismo stack que el base, asi que lo
   *   expulsa y el centrado se conserva tambien presionada (la flecha no se mueve).
   * - `transition-colors`: expulsa el `transition-all` del base, asi que aunque algun valor
   *   cambiara al presionar, el desplazamiento no podria animarse; el fundido del `hover`
   *   se conserva.
   */
  const arrowClass = cn(
    'pointer-events-auto sticky top-[50vh] z-20 -translate-y-1/2 rounded-full border bg-background/95 shadow-md backdrop-blur transition-colors active:not-aria-[haspopup]:-translate-y-1/2',
    TOUCH_TARGET,
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
