import { assertPermission, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada del caso de uso (QC-74 R18): id, EMPRESA y CONJUNTO DE PERMISOS. El nombre
 * del rol ya no viaja hasta aqui —no se lee, no se compara y no se recibe—: se autoriza por
 * permiso, nunca por rol.
 *
 * `companyId` (QC-76 R17, R19, R20) es la empresa de quien pregunta, y esta aqui —y no como
 * parametro suelto de `listUnits`— porque viaja SIEMPRE junta con los permisos: como argumento
 * separado, cada llamante nuevo podria olvidarse de pasarla o, peor, elegirla. La rellena el
 * adaptador driving con el contexto de sesion del servidor, nunca la entrada del llamante.
 *
 * **La empresa SIRVE PARA FILTRAR y NO AUTORIZA POR SI SOLA** (R20, `docs/architecture.md`):
 * que el `Actor` traiga empresa no concede ningun permiso. El permiso se comprueba APARTE y
 * PRIMERO, con `requirePermission`, antes de zod y antes de tocar el repositorio; solo despues
 * la empresa entra en el `where` como ambito de lectura.
 */
export type Actor = {
  readonly id: string;
  readonly companyId: string;
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
