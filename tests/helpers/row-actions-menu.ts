// Abrir y pulsar un item del menu de 3 puntos de una fila (`components/shared/row-actions-menu.tsx`)
// en tests unitarios. Equivalente de `e2e/helpers/row-actions-menu.ts` para Vitest + Testing Library.
import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

import { esperarInteractiva } from './user-event';

/**
 * Abre el menu del disparador y devuelve el contenedor `role="menu"`. El menu se monta en un
 * portal fuera de la fila, asi que se busca en todo el documento, no dentro de la fila. Si el
 * disparador ya tiene su menu abierto (`aria-expanded="true"`) no se vuelve a pulsar: un segundo
 * clic lo cerraria.
 */
export async function openRowActionsMenu(user: UserEvent, trigger: HTMLElement): Promise<HTMLElement> {
  if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
  return screen.findByRole('menu');
}

/**
 * Abre el menu del disparador y devuelve el item con ese `data-testid`, ya interactivo: el popup
 * entra con `pointer-events: none` y lo suelta un tick despues (ver `esperarInteractiva`).
 */
export async function getRowActionItem(
  user: UserEvent,
  trigger: HTMLElement,
  itemTestId: string,
): Promise<HTMLElement> {
  const menu = await openRowActionsMenu(user, trigger);
  return esperarInteractiva(within(menu).getByTestId(itemTestId));
}

/** Abre el menu del disparador y pulsa el item con ese `data-testid`. */
export async function clickRowAction(
  user: UserEvent,
  trigger: HTMLElement,
  itemTestId: string,
): Promise<void> {
  await user.click(await getRowActionItem(user, trigger, itemTestId));
}
