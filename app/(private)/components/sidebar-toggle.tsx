'use client';

import { ChevronLeftIcon } from 'lucide-react';

import { SIDEBAR_PANEL_ID } from '@/components/private/app-sidebar';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * Nombre accesible del control.
 *
 * Es constante del modulo y no un literal suelto en el JSX para que los tests puedan
 * citarlo sin afirmar sobre copy, y para que el dia que entre i18n haya un solo punto que
 * tocar.
 */
export const SIDEBAR_TOGGLE_LABEL = 'Alternar barra lateral';

/**
 * Control de apertura de la barra lateral en el encabezado.
 *
 * El primitivo ya decide segun el viewport: en ancho alterna expandido/modo icono, en
 * angosto abre y cierra el panel superpuesto. Lo que **no** es lo mismo es el estado que
 * hay que declarar, y por eso este wrapper existe:
 *
 * - en viewport angosto el estado real es `openMobile` (el panel del `Sheet`);
 * - en viewport ancho es `open` (`state === 'expanded'`).
 *
 * Confundirlos deja un `aria-expanded` que miente en uno de los dos modos.
 *
 * La flecha, en cambio, gira solo con `openMobile`: `useIsMobile` arranca en `false`, y si
 * leyera `open` (sembrado por la cookie de escritorio) giraria sola al hidratar en un
 * telefono. El control solo se ve en viewport angosto, asi que en escritorio no importa.
 *
 * `SidebarTrigger` ya llama a `toggleSidebar()` en su propio `onClick`: aqui **no** se
 * duplica el manejador, o cada clic alternaria dos veces.
 */
export function SidebarToggle() {
  const { open, openMobile, isMobile } = useSidebar();
  const isExpanded = isMobile ? openMobile : open;

  return (
    <SidebarTrigger
      variant="outline"
      className="size-11"
      aria-expanded={isExpanded}
      aria-controls={SIDEBAR_PANEL_ID}
      aria-label={SIDEBAR_TOGGLE_LABEL}
      data-testid="private-sidebar-toggle"
    >
      <ChevronLeftIcon
        className={cn(
          'transition-transform duration-(--dur-base) ease-(--ease-standard)',
          !openMobile && 'rotate-180',
        )}
      />
    </SidebarTrigger>
  );
}
