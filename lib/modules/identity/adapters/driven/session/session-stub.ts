import type { SessionUser } from '../../../domain/session-user';

// Implementa el puerto `SessionProvider` (`../../../ports/session-provider`):
// `getSessionUser` cumple `getSessionUser`, `endSession` cumple `endSession`.

/**
 * STUB del proveedor de sesion de la zona privada.
 *
 * **Este archivo lo reemplaza o reescribe la feature 10** (sesion real): es el unico
 * punto de costura de la sesion. **Ningun archivo de UI lo importa**, salvo el layout
 * de servidor `app/(private)/layout.tsx`, que llama a `getSessionUser()` y reparte el
 * resultado por props.
 *
 * No toca `next/headers`, `next/navigation`, cookies, base de datos ni red (R16, R22,
 * R35). Los tests **no** afirman sobre el valor de relleno: construyen su propio
 * `SessionUser`.
 */

/** Valor de relleno fijo hasta que la feature 10 lea la sesion real. */
const PLACEHOLDER_SESSION_USER: SessionUser = {
  id: 'placeholder-user',
  username: 'usuario',
  displayName: 'Usuario de Prueba',
  roleName: 'Administrador',
};

export async function getSessionUser(): Promise<SessionUser> {
  return PLACEHOLDER_SESSION_USER;
}

/** No-op: hoy no hay sesion que invalidar. La feature 10 invalida aqui la cookie. */
export async function endSession(): Promise<void> {}
