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
/**
 * QC-94 T1 — El CUERPO UNICO de la pertenencia. Privado a proposito: no se exporta ni se reexporta
 * desde `index.ts`, porque quien autoriza debe pasar por una de las dos aserciones de abajo, que
 * son las que lanzan. Extraerlo aqui es lo que permite que `assertAnyPermission` exista SIN una
 * segunda implementacion de la regla (QC-74 R12): las dos preguntan por esta funcion.
 *
 * Mismo comportamiento que tenia escrito `assertPermission` antes de la extraccion, letra por
 * letra: pertenencia EXACTA, sin normalizacion y sin coincidencia parcial (R13), y cerrado ante
 * actor ausente, sin conjunto de permisos o con un conjunto que no es un array (R14).
 */
function holdsPermission(
  actor: PermissionBearer | null | undefined,
  permission: PermissionCode,
): boolean {
  return Boolean(actor) && Array.isArray(actor!.permissions) && actor!.permissions.includes(permission);
}

export function assertPermission(
  actor: PermissionBearer | null | undefined,
  permission: PermissionCode,
  onDenied: () => Error,
): void {
  if (!holdsPermission(actor, permission)) {
    throw onDenied();
  }
}

/**
 * QC-94 (R1, R3) — hermana de `assertPermission` para las operaciones que aceptan CUALQUIERA de
 * varios codigos alternativos: basta con que el actor traiga UNO. No exige los dos y no deriva uno
 * del otro, que seguiria estando prohibido (R13).
 *
 * Falla cerrado exactamente igual que su hermana (R2, R14) porque comparte cuerpo con ella: actor
 * ausente, sin conjunto de permisos, con un conjunto vacio, con un conjunto que no es un array o
 * sin ninguno de los codigos exigidos se rechazan todos igual.
 *
 * El parametro es una TUPLA NO VACIA y no un `PermissionCode[]`: asi
 * `assertAnyPermission(actor, [])` -que denegaria a todo el mundo en silencio, y concederia a todo
 * el mundo el dia que alguien invirtiera la condicion- NO COMPILA. Es mas barato que un test.
 *
 * El error lo pone quien llama (R15), igual que arriba: esta funcion no conoce ninguna jerarquia
 * de errores. Devuelve `void` y no una firma de asercion por el mismo motivo que `assertPermission`
 * (`QC-74 design.md > 5`): el estrechamiento vive en el `requireAnyPermission` de cada modulo.
 */
export function assertAnyPermission(
  actor: PermissionBearer | null | undefined,
  permissions: readonly [PermissionCode, ...PermissionCode[]],
  onDenied: () => Error,
): void {
  if (!permissions.some((permission) => holdsPermission(actor, permission))) {
    throw onDenied();
  }
}
