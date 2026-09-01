import type { LoginInput } from './credentials';

/**
 * STUB de verificacion de credenciales.
 *
 * **Este archivo lo reemplaza la feature 10** (autenticacion real): es el unico punto
 * de costura del login. Ningun archivo de UI lo importa; solo lo cablea
 * `lib/composition/index.ts`, que es lo que consume
 * `lib/modules/identity/adapters/driving/login-action.ts`.
 *
 * Mientras no haya verificacion real, todo intento con forma valida se trata como
 * credenciales no aceptadas (R18). No toca base de datos, ni red, ni cookies, ni hash
 * (R19).
 */
export async function verifyCredentials(input: LoginInput): Promise<{ ok: boolean }> {
  void input;
  return { ok: false };
}
