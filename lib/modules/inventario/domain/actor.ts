import {
  assertPermission,
  type PermissionBearer,
  type PermissionCode,
} from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada de cada caso de uso (R1): id, EMPRESA y el conjunto de permisos vigente,
 * nada mas. QC-74 (R18): NO lleva nombre de rol -este modulo no autoriza por rol y no debe ni
 * recibir el dato-.
 *
 * `companyId` (QC-49 R11, R12, R17) es la empresa en cuyo nombre se opera, y esta DENTRO del
 * actor -y no como parametro suelto de cada caso de uso- porque asi viaja SIEMPRE junto a los
 * permisos: como argumento separado, cada llamante nuevo podria olvidarse de pasarla o, peor,
 * ELEGIRLA. La rellena el adaptador driving con el contexto de sesion del servidor, nunca la
 * entrada del llamante; sin contexto no hay actor, y sin actor no hay consulta.
 *
 * **La empresa SIRVE PARA FILTRAR y NO AUTORIZA POR SI SOLA** (R11,
 * `docs/architecture.md > Acceso a datos y autorizacion`): que el `Actor` traiga empresa no
 * concede ningun permiso. El permiso se comprueba APARTE y PRIMERO, con `requirePermission`,
 * antes de zod y antes de tocar el repositorio; solo despues la empresa se convierte en
 * `InventoryScope` y entra en la consulta.
 */
export type Actor = {
  readonly id: string;
  readonly companyId: string;
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

/**
 * El codigo de escritura de este modulo, escrito UNA sola vez y dentro del dominio: lo que
 * sale al exterior es la pregunta, no la cadena.
 */
const INVENTARIO_MODIFICAR: PermissionCode = 'inventario.modificar';

/** Error centinela, privado: assertPermission exige una fabrica pero esto nunca lanza afuera. */
const DENEGADO = new Error('inventario: permiso de escritura ausente');

/**
 * Puede este conjunto de permisos ajustar el stock de un lote? Devuelve boolean y NO LANZA:
 * es una pregunta de presentacion, no una autorizacion.
 *
 * Anticipar no es autorizar: el corte real sigue siendo requirePermission en la primera
 * linea del caso de uso de ajuste, y este predicado no lo sustituye, no lo relaja y no lo
 * adelanta.
 *
 * Delega en assertPermission de identity, la UNICA implementacion de la pertenencia exacta:
 * no se reimplementa con un includes que pueda divergir.
 *
 * Acepta cualquier portador de permisos, no solo el Actor de este modulo: quien pregunta es
 * un Server Component con la sesion resuelta.
 */
export function canAdjustBatchStock(actor: PermissionBearer | null | undefined): boolean {
  try {
    assertPermission(actor, INVENTARIO_MODIFICAR, () => DENEGADO);
    return true;
  } catch {
    return false;
  }
}
