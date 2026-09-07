// QC-54 — la UNICA implementacion de la regla «el actor es Administrador» (R6). Dominio puro:
// el unico import es `./roles`, que es el UNICO sitio del repo que escribe a mano el literal.
import { ROLE_ADMINISTRADOR } from './roles';

/** Lo minimo que la regla necesita saber de un actor. Cada modulo conserva su propio `Actor`. */
export type RoleBearer = { readonly roleName: string | null };

/**
 * La UNICA implementacion de «el actor es Administrador» (R6). Falla cerrado: actor ausente
 * o rol nulo se rechazan igual que un rol distinto. Compara por igualdad EXACTA (R8, R9), sin
 * `includes` ni normalizacion, asi que un rol llamado «Administradores externos» no se cuela.
 *
 * El error lo pone quien llama (R7): esta funcion no conoce ninguna jerarquia de errores, asi
 * que cada modulo sigue lanzando su propio `UnauthorizedError` y los adaptadores driving no
 * cambian como serializan un 403.
 *
 * Devuelve `void`, NO una firma de asercion (`asserts actor is RoleBearer`). Es deliberado
 * (`design.md > 2.2`): TypeScript no verifica el CUERPO de una funcion de asercion, solo exige
 * que el llamante la invoque por un nombre con anotacion de tipo explicita. Cada `requireAdmin`
 * de modulo conserva su propia firma `asserts actor is Actor` y delega en esta, asi que el
 * estrechamiento de tipos que ven los casos de uso no cambia.
 */
export function assertAdminRole(
  actor: RoleBearer | null | undefined,
  onDenied: () => Error,
): void {
  if (!actor || actor.roleName !== ROLE_ADMINISTRADOR) {
    throw onDenied();
  }
}
