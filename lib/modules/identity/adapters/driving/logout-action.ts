'use server';

import { redirect } from 'next/navigation';

import { identity } from '@/lib/composition';
import { LOGIN_ROUTE } from '@/lib/shared/routes';

/**
 * Server Action de cierre de sesion. **Contrato congelado** (`design.md > 3`): sin
 * parametros y sin valor de retorno, aunque en la practica nunca retorna (`redirect`
 * no devuelve).
 *
 * El `redirect(LOGIN_ROUTE)` va **fuera** de cualquier `try`: Next lo implementa
 * lanzando una excepcion especial para señalizar la navegacion, y un `try` que lo
 * envuelva se la tragaria e impediria la redireccion.
 */
export async function logoutAction(): Promise<void> {
  await identity.endSession();

  redirect(LOGIN_ROUTE);
}
