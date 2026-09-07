// QC-74 — la UNICA implementacion de «el actor tiene este permiso» (R12, R13, R14). Dominio puro:
// el unico import es el tipo del catalogo, que es el UNICO sitio donde se escriben los codigos.
import type { PermissionCode } from './permissions';

/** Lo minimo que la regla necesita saber del actor. Cada modulo conserva su propio `Actor`. */
export type PermissionBearer = { readonly permissions: readonly string[] };

/**
 * Decide por PERTENENCIA EXACTA del codigo al conjunto de permisos del actor (R13): sin
 * normalizar, sin coincidencia parcial y sin ninguna implicacion entre permisos —tener
 * `<modulo>.modificar` NO concede `<modulo>.consultar`, ni al reves—.
 *
 * Falla cerrado (R14): actor ausente, sin conjunto de permisos, con un conjunto que no es un
 * array, vacio, o que no contiene el codigo exigido, se rechazan todos igual y sin revelar nada
 * del recurso pedido.
 *
 * El error lo pone quien llama (R15): esta funcion no conoce ninguna jerarquia de errores, asi
 * que cada modulo sigue lanzando su propio `UnauthorizedError` y los adaptadores driving no
 * cambian como serializan un 403.
 *
 * Devuelve `void`, NO una firma de asercion (`asserts actor is PermissionBearer`). Es deliberado
 * (`design.md > 5`): TypeScript no verifica el CUERPO de una funcion de asercion, asi que el
 * estrechamiento vive en el `requirePermission` de cada modulo, que si declara `asserts actor is
 * Actor` y delega aqui.
 */
export function assertPermission(
  actor: PermissionBearer | null | undefined,
  permission: PermissionCode,
  onDenied: () => Error,
): void {
  if (!actor || !Array.isArray(actor.permissions) || !actor.permissions.includes(permission)) {
    throw onDenied();
  }
}
