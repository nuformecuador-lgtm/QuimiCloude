// QC-74 — el permiso sale del CONTRATO PUBLICO de `identity`, que es su dueno
// (`design.md > 2` y `> 5`): `lib/modules/identity/domain/permissions.ts` es el UNICO sitio
// del repo que escribe los codigos del catalogo, y `identity/domain/require-permission.ts`
// es la UNICA implementacion de la regla «el actor tiene este permiso». `proveedores` NO
// declara ninguna constante propia y NO conoce ningun nombre de rol (R18): delega en
// `assertPermission`, igual que los demas modulos.
//
// Barrel, NUNCA ruta profunda (`docs/architecture.md > La regla de dependencias`).
import { assertPermission, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada de cada uno de los nueve casos de uso: id, EMPRESA y su conjunto de
 * permisos, nada mas. **Sin nombre de rol** (R18): este modulo no lo lee, no lo compara y no
 * lo recibe; quien decide es la pertenencia exacta del codigo al conjunto (R13).
 *
 * `companyId` viaja dentro del actor y no como parametro suelto de cada caso de uso, para
 * que ningun llamante nuevo pueda olvidarlo ni, peor, elegirlo. Filtra y no autoriza por si
 * solo: el permiso se sigue exigiendo aparte y primero, con `requirePermission`.
 */
export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

/**
 * Primera linea de los nueve casos de uso (R12): antes de `zod` y antes de tocar ningun
 * puerto. Falla cerrado (R14): actor ausente, sin conjunto de permisos, con el conjunto
 * vacio o sin el codigo exigido se rechazan igual, todos con el mismo error de
 * autorizacion y sin revelar nada del recurso pedido.
 *
 * La comparacion es de PERTENENCIA EXACTA, sin normalizacion, sin coincidencia parcial y
 * sin ninguna implicacion entre permisos (R13): `proveedores.modificar` NO concede
 * `proveedores.consultar`, ni al reves.
 *
 * El error es el `UnauthorizedError` de ESTE modulo, subclase de `ProveedoresError` (R15):
 * `assertPermission` no conoce ninguna jerarquia de errores y recibe la fabrica, asi que
 * los adaptadores driving siguen serializando con `error instanceof ProveedoresError` y
 * con el mismo `code` estable de siempre.
 *
 * Conserva la firma `asserts actor is Actor`: es la que estrecha el tipo dentro del caso de
 * uso para que `actor.id` compile despues de la comprobacion.
 *
 * Consultar tambien pasa por aqui (decision cerrada 1): la lista, la ficha y el listado del
 * catalogo exigen `proveedores.consultar` igual que las mutaciones exigen
 * `proveedores.modificar`.
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
