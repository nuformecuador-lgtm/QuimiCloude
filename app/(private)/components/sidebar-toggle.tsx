'use client';

import { SIDEBAR_PANEL_ID } from '@/components/private/app-sidebar';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

/**
 * Nombre accesible del control (R23, R31).
 *
 * Es constante del modulo y no un literal suelto en el JSX para que los tests puedan
 * citarlo sin afirmar sobre copy, y para que el dia que entre i18n haya un solo punto que
 * tocar. El primitivo trae su propio `sr-only` en ingles ("Toggle Sidebar") dentro de
 * `components/ui/`, que **no se edita**: este `aria-label` lo sustituye como nombre
 * accesible en vez de convivir con el.
 */
export const SIDEBAR_TOGGLE_LABEL = 'Alternar barra lateral';

/**
 * Control unico de colapso/apertura de la barra lateral (`design.md > 5.5`, `5.6`).
 *
 * Un solo control sirve a los dos mecanismos porque el primitivo ya decide segun el
 * viewport: en ancho alterna expandido/modo icono (R23), en angosto abre y cierra el panel
 * superpuesto (R31). Lo que **no** es lo mismo es el estado que hay que declarar, y por eso
 * este wrapper existe:
 *
 * - en viewport angosto el estado real es `openMobile` (el panel del `Sheet`);
 * - en viewport ancho es `open` (`state === 'expanded'`).
 *
 * Confundirlos deja un `aria-expanded` que miente en uno de los dos modos, que es
 * exactamente el fallo silencioso que R23 y R31 cubren por separado.
 *
 * `SidebarTrigger` ya llama a `toggleSidebar()` en su propio `onClick`: aqui **no** se
 * duplica el manejador, o cada clic alternaria dos veces.
 */
export function SidebarToggle() {
  const { open, openMobile, isMobile } = useSidebar();
  const isExpanded = isMobile ? openMobile : open;

  return (
    <SidebarTrigger
      aria-expanded={isExpanded}
      aria-controls={SIDEBAR_PANEL_ID}
      aria-label={SIDEBAR_TOGGLE_LABEL}
      data-testid="private-sidebar-toggle"
    />
  );
}
