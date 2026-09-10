// lib/modules/identity/domain/set-user-account-status.ts
import { requirePermission, type Actor } from './actor';
import {
  LastAdministratorError,
  NotFoundError,
  SelfOperationError,
  ValidationError,
} from './errors';
import { ROLE_ADMINISTRADOR } from './roles';
import { setAccountStatusSchema } from './user-input';

import type { UserAdminRepository } from '../ports/user-admin-repository';

export type SetUserAccountStatusDeps = {
  readonly users: UserAdminRepository;
  /** Ver el comentario identico de `create-user.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Mover el estado de cuenta de un usuario (R21, R22, R25, R26, R33, R34).
 *
 * `requirePermission(actor, 'usuarios.modificar')` es la PRIMERA linea, antes de `zod` y antes de
 * tocar el puerto (R1, R2).
 *
 * **Se escriben las TRES cosas** (R25): el nuevo valor, el **instante** del cambio y el
 * **identificador del actor** como autor. Ese autor **no queda vacio aqui**: el `NULL` de QC-65 R10
 * significa «lo cambio el sistema» y en esta operacion el cambio lo hace siempre una persona. El
 * unico sitio donde el autor queda nulo es el NACIMIENTO de la cuenta (R49, `create-user.ts`).
 *
 * **Los cuatro valores valen como destino desde cualquier otro, `blocked` incluido** (R26): no hay
 * transiciones prohibidas en esta feature, y por eso no hay aqui ningun `canTransition`. El conjunto
 * cerrado se importa de QC-65 a traves de `setAccountStatusSchema`: el enum no se reescribe.
 *
 * **No se toca el mecanismo de bloqueo por intentos fallidos** (R45): esta operacion no lee ni escribe
 * ninguno de los tres contadores de QC-19. Limpiarlos al salir de `blocked` es de QC-78, duena de ese
 * mecanismo.
 */
export function createSetUserAccountStatus(
  deps: SetUserAccountStatusDeps,
): (actor: Actor | null | undefined, id: string, input: unknown) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function setUserAccountStatus(
    actor: Actor | null | undefined,
    id: string,
    input: unknown,
  ): Promise<void> {
    requirePermission(actor, 'usuarios.modificar');

    const parsed = setAccountStatusSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // R21, primera guarda del administrador (decision cerrada 9a): nadie mueve su PROPIO estado de
    // cuenta, y no se modifica ninguna fila. Va ANTES del puerto, y responde `self_operation` y no
    // `not_found` porque la pantalla de QC-67 tiene que poder explicarlo sin mentir.
    if (id === actor.id) throw new SelfOperationError();

    // R22: la invariante del ultimo administrador en `active` la hace cumplir `applyGuardedChange`
    // DENTRO de su transaccion con bloqueo (`design.md > 9.2`). R24: el nombre del rol administrador
    // se IMPORTA de `./roles` y viaja como argumento; el literal no se escribe en ningun archivo de
    // esta feature, y el rol del ACTOR no participa en nada (R4).
    const outcome = await deps.users.applyGuardedChange({
      kind: 'account_status',
      companyId: actor.companyId,
      id,
      adminRoleName: ROLE_ADMINISTRADOR,
      accountStatus: parsed.data.accountStatus,
      changedBy: actor.id,
      now: now(),
    });

    if (outcome === 'ok') return;
    // R33, R34: no existe, esta borrado o es de otra empresa son el MISMO caso.
    if (outcome === 'not_found') throw new NotFoundError();
    throw new LastAdministratorError();
  };
}
