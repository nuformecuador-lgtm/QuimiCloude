import { assertPermission, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada del caso de uso (QC-74 R18): id y CONJUNTO DE PERMISOS, nada mas. El nombre
 * del rol ya no viaja hasta aqui —no se lee, no se compara y no se recibe—: se autoriza por
 * permiso, nunca por rol.
 */
export type Actor = {
  readonly id: string;
  readonly permissions: readonly string[];
};

/**
 * Primera linea del caso de uso de listado (QC-74 R12). Falla cerrado: actor ausente, sin
 * conjunto de permisos, con el conjunto vacio o sin el codigo exigido se rechazan igual, todos
 * con el mismo error de autorizacion, y ANTES de validar la entrada y de tocar el repositorio.
 *
 * La comprobacion es de PERTENENCIA EXACTA del codigo al conjunto, sin normalizacion, sin
 * coincidencia parcial y sin ninguna implicacion entre permisos (R13): un conjunto con
 * `'unidades.'` no concede `'unidades.consultar'`. Delega en `assertPermission` de `identity`,
 * que es la unica implementacion de la regla, y le pasa la fabrica del `UnauthorizedError` de
 * ESTE modulo —subclase de `UnidadesError`— para que el adaptador driving lo siga serializando
 * con su `error instanceof UnidadesError` (R15).
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
