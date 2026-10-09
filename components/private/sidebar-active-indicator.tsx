'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

type IndicatorVariant = 'menu' | 'sub';
type Trigger = 'route' | 'resize';

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

// Solo el activo de ESTA lista: el de una sublista anidada lo pinta el indicador de esa sublista.
const ACTIVE_ITEM_SELECTOR = ':scope > ul > li > [data-active]';

/**
 * Suma los desplazamientos por la cadena de `offsetParent` hasta el contenedor. El `<li>` del
 * primitivo es `relative`, asi que el `offsetTop` del boton solo no basta. `null` si el activo
 * no se puede medir (oculto o fuera del contenedor): entonces lo sigue pintando el CSS.
 */
function measureWithin(element: HTMLElement, container: HTMLElement): Box | null {
  let x = 0;
  let y = 0;
  let node: Element | null = element;

  while (node !== null && node !== container) {
    if (!(node instanceof HTMLElement)) return null;
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }

  if (node !== container) return null;

  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

/**
 * Coloca el indicador y devuelve si quedo visible. Desliza solo si la misma lista ya tenia un
 * activo; si el activo llega de fuera, aparece en su sitio con un fundido. La primera colocacion
 * es inmediata y sin fundido porque el CSS ya pinta ese mismo resaltado en el boton.
 */
function placeIndicator(
  container: HTMLElement,
  indicator: HTMLElement,
  hadActive: boolean | null,
  trigger: Trigger,
): boolean {
  const active = container.querySelector<HTMLElement>(ACTIVE_ITEM_SELECTOR);
  const box = active ? measureWithin(active, container) : null;

  if (box === null) {
    indicator.dataset.motion = trigger === 'route' && hadActive === true ? 'fade' : 'none';
    indicator.style.opacity = '0';
    delete container.dataset.indicatorReady;
    return false;
  }

  const slide = trigger === 'route' && hadActive === true;
  const fade = trigger === 'route' && hadActive === false;

  indicator.dataset.motion = slide ? 'slide' : 'none';
  if (fade) indicator.style.opacity = '0';
  indicator.style.width = `${box.width}px`;
  indicator.style.height = `${box.height}px`;
  indicator.style.transform = `translate(${box.x}px, ${box.y}px)`;
  container.dataset.indicatorReady = '';

  if (fade) {
    // Fuerza el calculo de estilos con la opacidad a 0 y sin transicion de posicion; sin esto el
    // navegador funde los dos cambios y el indicador se desliza o aparece de golpe.
    void indicator.offsetWidth;
    indicator.dataset.motion = 'fade';
  }

  indicator.style.opacity = '1';
  return true;
}

type SidebarActiveIndicatorProps = {
  /** `sub` lleva el fondo y el anillo del submenu, mas contenidos que los del primer nivel. */
  readonly variant: IndicatorVariant;
  /** La lista (`SidebarMenu` o `SidebarMenuSub`) cuyo item activo se resalta. */
  readonly children: ReactNode;
};

/**
 * Resaltado del item activo que se desliza entre los items de una misma lista.
 *
 * Es decorativo: el `<span>` va con `aria-hidden` y fuera de la lista, asi que no cambia el
 * arbol accesible ni el numero de items. Sin JavaScript se queda invisible y el boton activo se
 * pinta solo con su CSS; el boton deja de pintar su fondo solo cuando el contenedor lleva
 * `data-indicator-ready`.
 */
export function SidebarActiveIndicator({ variant, children }: SidebarActiveIndicatorProps) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const hadActiveRef = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (container === null || indicator === null) return;

    hadActiveRef.current = placeIndicator(container, indicator, hadActiveRef.current, 'route');
  }, [pathname]);

  // Contraer a modo icono, abrir un grupo o girar el movil mueven el activo sin cambiar de ruta.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (container === null || indicator === null || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      hadActiveRef.current = placeIndicator(container, indicator, hadActiveRef.current, 'resize');
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <span
        ref={indicatorRef}
        aria-hidden="true"
        data-slot="sidebar-active-indicator"
        data-variant={variant}
        className="pointer-events-none absolute top-0 left-0 rounded-md transition-none duration-(--dur-base) ease-(--ease-standard) data-[motion=fade]:transition-opacity data-[motion=slide]:transition-[transform,opacity]"
      />
      {children}
    </div>
  );
}
