import { assertPermission, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada de cada caso de uso (R1): id y el conjunto de permisos vigente, nada
 * mas. QC-74 (R18): NO lleva nombre de rol -este modulo no autoriza por rol y no debe ni
 * recibir el dato-.
 */
export type Actor = {
  readonly id: string;
  readonly permissions: readonly string[];
};

/**
 * Primera linea de los nueve casos de uso (R2, R3, QC-74 R12). Exige un permiso CONCRETO
 * del catalogo y falla cerrado: actor ausente, sin conjunto de permisos, con el conjunto
 * vacio o sin el codigo exigido se rechazan igual, todos con el mismo error de
 * autorizacion, y ANTES de validar la entrada y de tocar cualquier puerto.
 *
 * La decision es por PERTENENCIA EXACTA del codigo al conjunto (QC-74 R13): sin
 * normalizar, sin coincidencia parcial y sin jerarquia -tener `inventario.modificar` no
 * concede `inventario.consultar` ni al reves-. Delega en `assertPermission` de `identity`,
 * que es la unica implementacion de la regla; el error es el de ESTE modulo (QC-74 R15),
 * subclase de `InventarioError`, para que los adaptadores driving lo sigan serializando
 * con `error instanceof InventarioError`.
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
