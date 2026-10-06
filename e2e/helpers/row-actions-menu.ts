// Abrir un item del menu de 3 puntos de una fila (`components/shared/row-actions-menu.tsx`).
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Abre el menu del disparador y devuelve el item pedido. El menu se monta en un portal fuera de
 * la fila, asi que el item se busca en el menu abierto de la pagina. En WebKit un clic antes de
 * hidratar se pierde sin error: se repite hasta que el menu aparece.
 */
export async function openRowActionsMenuItem(
  page: Page,
  trigger: Locator,
  itemTestId: string,
): Promise<Locator> {
  const item = page.getByRole('menu').getByTestId(itemTestId);
  await expect(async () => {
    if ((await item.count()) === 0) await trigger.click();
    await expect(item).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  return item;
}
