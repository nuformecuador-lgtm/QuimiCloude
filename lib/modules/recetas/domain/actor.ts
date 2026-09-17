import { assertPermission, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada de cada caso de uso: id, EMPRESA y CONJUNTO DE PERMISOS, nada mas. QC-74
 * (R18) retiro el nombre del rol: ningun caso de uso ni adaptador de este modulo lee,
 * compara ni recibe el nombre del rol —eso es display, y vive en `identity`—.
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
 * Primera linea de los cinco casos de uso (R12): ANTES de zod y ANTES de tocar cualquier
 * puerto -repositorio, catalogo de productos, catalogo de unidades o almacenamiento de
 * imagenes-.
 *
 * Falla cerrado (R14): actor ausente, sin conjunto de permisos, con el conjunto vacio o sin
 * el codigo exigido se rechazan todos igual, con el mismo `UnauthorizedError` de ESTE modulo
 * —subclase de `RecetasError`—, de modo que el adaptador driving lo sigue serializando con su
 * `error instanceof RecetasError` y el mismo `code` estable (R15).
 *
 * La comparacion es de pertenencia EXACTA, sin normalizacion, sin coincidencia parcial y sin
 * ninguna implicacion entre permisos (R13): `recetas.modificar` NO concede
 * `recetas.consultar`, ni al reves. Delega en `assertPermission` de `identity`, que es la
 * unica implementacion de la regla.
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
