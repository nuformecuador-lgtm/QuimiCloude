'use server';

import { endSession } from '@/lib/modules/identity/adapters/driven/session/session-stub';

/**
 * Server Action de cierre de sesion. **Contrato congelado** (`design.md > 3`): la
 * feature 10 anade aqui el `redirect(LOGIN_ROUTE)` sin cambiar esta firma.
 *
 * Sin parametros y sin valor de retorno a proposito: el logout real termina en
 * `redirect`, que no devuelve, asi que cualquier estado de formulario seria contrato
 * muerto (R22).
 */
export async function logoutAction(): Promise<void> {
  await endSession();
}
