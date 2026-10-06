// Pulsar un control que pide confirmacion (`components/shared/confirm-action-dialog.tsx`) y confirmar.
import { expect, type Locator, type Page } from '@playwright/test';

export const ASSIGNED_ORDER_START_CONFIRM_TESTID = 'assigned-order-start-confirm';
export const ORDER_EXECUTION_FINISH_CONFIRM_TESTID = 'order-execution-finish-confirm';
export const PACKING_ORDER_START_CONFIRM_TESTID = 'packing-order-start-confirm';
export const PACKING_ORDER_FINISH_CONFIRM_TESTID = 'packing-order-finish-confirm';

/**
 * Pulsa el disparador y confirma en el dialogo. El dialogo se monta en un portal fuera del
 * disparador, asi que el boton se busca en la pagina. En WebKit un clic antes de hidratar se
 * pierde sin error: se repite hasta que el dialogo aparece.
 */
export async function clickAndConfirm(
  page: Page,
  trigger: Locator,
  confirmTestId: string,
): Promise<void> {
  const confirm = page.getByTestId(confirmTestId);
  await expect(async () => {
    if ((await confirm.count()) === 0) await trigger.click();
    await expect(confirm).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await confirm.click();
}
